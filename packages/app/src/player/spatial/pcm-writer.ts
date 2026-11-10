import { PCM_BLOCK_SAMPLES } from "../nac/types";
import type { DecodeRequest, DecodeResponse, PCMChunk } from "../nac/types";
import type { PcmMix } from "./pcm-mix";

/** Choose the widest layout the playback graph can actually open before caching PCM. */
export function requestPcmOutput(fileId: number, layouts: readonly number[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const onOutput = ({ data }: MessageEvent<DecodeRequest>) => {
      if (data.type !== "output" || data.fileId !== fileId) return;
      self.removeEventListener("message", onOutput);
      if (layouts.includes(data.channels)) resolve(data.channels);
      else reject(new Error("播放器选择了不支持的输出布局"));
    };
    self.addEventListener("message", onOutput);
    self.postMessage({ type: "output", fileId, layouts } satisfies DecodeResponse);
  });
}

export class PcmWriter {
  written = 0;
  private channels: PCMChunk["channels"];

  constructor(
    private readonly fileId: number,
    readonly samples: number,
    readonly rate: number,
    private readonly mix: PcmMix,
  ) {
    if (!Number.isSafeInteger(samples) || samples <= 0 || !Number.isFinite(rate) || rate <= 0)
      throw new Error("无效的音频采样参数");
    this.channels = this.allocate();
    const blocks = Math.ceil(samples / PCM_BLOCK_SAMPLES);
    this.send({ type: "info", fileId, info: {
      samples, rate, blocks, duration: samples / rate, delay: 0, channels: mix.length,
    } });
  }

  private send(data: DecodeResponse, transfer: Transferable[] = []) {
    self.postMessage(data, { transfer });
  }

  private allocate(): PCMChunk["channels"] {
    const length = Math.min(PCM_BLOCK_SAMPLES, this.samples - this.written);
    return this.mix.map(() => new Float32Array(length));
  }

  write(frames: number, read: (frame: number, channel: number) => number): void {
    const length = Math.min(frames, this.samples - this.written);
    for (let frame = 0; frame < length; frame++) {
      const index = this.written % PCM_BLOCK_SAMPLES;
      for (let channel = 0; channel < this.mix.length; channel++) {
        let sample = 0;
        for (const [source, gain] of this.mix[channel]) sample += read(frame, source) * gain;
        this.channels[channel][index] = sample;
      }
      this.written++;
      if (index + 1 !== this.channels[0].length) continue;

      const offset = this.written - this.channels[0].length;
      this.send({
        type: "chunk", fileId: this.fileId,
        chunk: { block: offset / PCM_BLOCK_SAMPLES, offset, channels: this.channels },
      }, this.channels.map((channel) => channel.buffer));
      if (this.written < this.samples) this.channels = this.allocate();
    }
  }

  complete() {
    if (this.written !== this.samples) throw new Error("音频解码不完整");
    this.send({ type: "complete", fileId: this.fileId });
  }
}
