import type * as Ort from 'onnxruntime-web/wasm';

import { DecodeQueue } from './decode-queue';
import { BlockSynthesizer, blockForSample, parseNAC, unpackCodes } from './nac';
import type { AudioInfo, DecodedAudio, NACFile, PCMChunk, StereoChannels } from './types';

let ort: typeof Ort;

const STATE_SHAPES = {
  in_buffer_conv_1: [2, 42, 2, 34],
  in_buffer_conv_2: [2, 21, 2, 130],
  in_buffer_conv_3: [2, 10, 2, 258],
  in_buffer_res_1: [2, 42, 1, 32],
  in_buffer_res_2: [2, 21, 1, 128],
  in_buffer_res_3: [2, 10, 1, 256],
} as const;

export interface StreamOptions {
  onInfo?: (info: AudioInfo) => void;
  onChunk: (chunk: PCMChunk) => void;
  onProgress?: (fraction: number) => void;
  /** 返回并清空最新跳转请求，单位为有效音频采样帧。 */
  takeSeek?: () => number | null;
  cancelled?: () => boolean;
}

export interface Decoder {
  stream(buffer: ArrayBuffer, options: StreamOptions): Promise<void>;
  decode(buffer: ArrayBuffer, progress?: (fraction: number) => void): Promise<DecodedAudio>;
  dispose(): Promise<void>;
}

/** 给 Worker 的 seek/cancel 消息一个宏任务执行机会，避免连续 Promise 饿死消息队列。 */
async function yieldToMessages(): Promise<void> {
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/** 一条连续推理链的状态；跳转时新建，避免把别的位置的历史状态带入目标。 */
class Cursor {
  private readonly feed: Record<string, Ort.Tensor> = {};
  private readonly synthesis: BlockSynthesizer;

  constructor(
    private readonly session: Ort.InferenceSession,
    file: NACFile,
    public block: number,
  ) {
    this.synthesis = new BlockSynthesizer(file);
    for (const [name, shape] of Object.entries(STATE_SHAPES)) {
      this.feed[name] = new ort.Tensor(
        'float32',
        new Float32Array(shape.reduce<number>((a, b) => a * b, 1)),
        shape,
      );
    }
  }

  async next(file: NACFile): Promise<PCMChunk> {
    const codes = new ort.Tensor('int32', unpackCodes(file, this.block), [2, 22, 32]);
    let outputs: Ort.InferenceSession.ReturnType | undefined;
    const retained = new Set<Ort.Tensor>();
    try {
      outputs = await this.session.run({ ...this.feed, codes });
      const freq = outputs.freq;
      if (!freq || freq.type !== 'float32' || freq.dims.join(',') !== '2,2,32,256')
        throw Error('模型输出频谱形状或类型不匹配');
      const chunk = this.synthesis.push(freq.data as Float32Array, this.block);
      const next: Record<string, Ort.Tensor> = {};
      for (const name of Object.keys(STATE_SHAPES)) {
        const tensor = outputs[name.replace('in_buffer', 'out_buffer')];
        if (!tensor) throw Error(`模型缺少状态输出 ${name}`);
        next[name] = tensor;
      }
      for (const name of Object.keys(STATE_SHAPES)) {
        this.feed[name].dispose();
        this.feed[name] = next[name];
        retained.add(next[name]);
      }
      this.block++;
      return chunk;
    } finally {
      codes.dispose();
      for (const tensor of Object.values(outputs ?? {}))
        if (!retained.has(tensor)) tensor.dispose();
    }
  }

  dispose(): void {
    for (const tensor of Object.values(this.feed)) tensor.dispose();
  }
}

export async function createDecoder(
  model: string | Uint8Array,
  wasmPath: string,
): Promise<Decoder> {
  ort = await import(/* @vite-ignore */ new URL('ort.wasm.min.mjs', wasmPath).href);
  ort.env.wasm.wasmPaths = wasmPath;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const options: Ort.InferenceSession.SessionOptions = {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  };
  const session =
    typeof model === 'string'
      ? await ort.InferenceSession.create(model, options)
      : await ort.InferenceSession.create(model, options);

  async function stream(buffer: ArrayBuffer, options: StreamOptions): Promise<void> {
    const file = parseNAC(buffer);
    const { samples, rate, blocks, duration, delay } = file;
    options.onInfo?.({ samples, rate, blocks, duration, delay });
    const queue = new DecodeQueue(file.blocks);
    let cursor: Cursor | undefined;
    const checkCancelled = (): void => {
      if (options.cancelled?.()) throw new DOMException('已取消', 'AbortError');
    };
    try {
      for (;;) {
        checkCancelled();
        const seek = options.takeSeek?.();
        if (seek !== null && seek !== undefined) queue.request(blockForSample(file, seek));
        const block = queue.next();
        if (block === null) break;
        if (!cursor || cursor.block !== block) {
          cursor?.dispose();
          // 当前 freq-22 图只有有限长度的卷积/残差历史。前推两个块既恢复模型状态，
          // 又恢复逆 STFT 的重叠尾部；预热音频丢弃，不计入完成率。
          cursor = new Cursor(session, file, Math.max(0, block - 2));
          while (cursor.block < block) {
            checkCancelled();
            await cursor.next(file);
            await yieldToMessages();
          }
          // 预热期间的新拖动在下轮立即处理，不发送已经过时的目标片段。
          const latest = options.takeSeek?.();
          if (latest !== null && latest !== undefined && blockForSample(file, latest) !== block) {
            queue.request(blockForSample(file, latest));
            continue;
          }
        }
        checkCancelled();
        const chunk = await cursor.next(file);
        checkCancelled();
        queue.finish(block);
        options.onChunk(chunk);
        options.onProgress?.(queue.completed / file.blocks);
        await yieldToMessages();
      }
    } finally {
      cursor?.dispose();
    }
  }

  return {
    stream,
    async decode(buffer, progress = () => {}) {
      const file = parseNAC(buffer);
      const channels: StereoChannels = [
        new Float32Array(file.samples),
        new Float32Array(file.samples),
      ];
      await stream(buffer, {
        onChunk(chunk) {
          for (let ch = 0; ch < 2; ch++) channels[ch].set(chunk.channels[ch], chunk.offset);
        },
        onProgress: progress,
      });
      return {
        channels,
        samples: file.samples,
        rate: file.rate,
        blocks: file.blocks,
        duration: file.duration,
      };
    },
    async dispose() {
      await session.release();
    },
  };
}
