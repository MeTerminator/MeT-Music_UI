import type { PlayerAudio } from '@met/core';
import workletURL from './audio-worklet.ts?worker&url';
import type { AudioInfo, DecodeRequest, DecodeResponse, PCMChunk, PlaybackCommand, PlaybackState } from './types';
import { outputContextTime, PcmOutputClock } from './output-clock';

let context: AudioContext | null = null;
let workletReady: Promise<void> | null = null;
function audioContext(): AudioContext {
  if (!context || context.state === 'closed') {
    context = new AudioContext({ latencyHint: 'interactive' });
    workletReady = null;
  }
  return context;
}
/** 在取链前的用户手势内调用，不等待被浏览器挂起的 resume。 */
export function unlockPcmAudio(): void {
  void audioContext().resume().catch(() => {});
}

type Handler = (...args: any[]) => void;

/** Howler 控制接口的 PCM 实现：PCM 缓存和采样时钟位于 AudioWorklet。 */
export class PcmStreamAudio implements PlayerAudio {
  private readonly context = audioContext();
  private readonly gain = this.context.createGain();
  private node: AudioWorkletNode | null = null;
  private outputChannels = 2;
  private worker: Worker | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private loadState = 'loading';
  private disposed = false;
  private desiredPlaying = false;
  private playRequest = 0;
  private position = 0;
  private readonly outputClock = new PcmOutputClock();
  private waiting = false;
  private revision = 0;
  private currentVolume = 1;
  private currentRate = 1;
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  private info: AudioInfo | null = null;
  private rejectReady: ((error: unknown) => void) | null = null;
  private resolveReady: (() => void) | null = null;
  private readonly ready: Promise<void>;
  private inputReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private resolveInput: (() => void) | null = null;
  private rejectInput: ((error: unknown) => void) | null = null;

  private constructor(
    private readonly signal: AbortSignal,
    private readonly progress: (percent: number) => void,
    private readonly preserveMultichannel: boolean,
  ) {
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    signal.addEventListener('abort', this.abort, { once: true });
  }

  static async open(
    buffer: ArrayBuffer | ReadableStream<Uint8Array>,
    base: string,
    signal: AbortSignal,
    progress: (percent: number) => void,
    createWorker: () => Worker,
    preserveMultichannel = false,
  ): Promise<PcmStreamAudio> {
    signal.throwIfAborted();
    const audio = new PcmStreamAudio(signal, progress, preserveMultichannel);
    // 初始化和推理可在 suspended 上下文中执行；无需播放权限即可预缓存。
    void audio.initialize(buffer, base, createWorker).catch((error) => audio.fail(error));
    await audio.ready;
    return audio;
  }

  private async initialize(buffer: ArrayBuffer | ReadableStream<Uint8Array>, base: string, createWorker: () => Worker): Promise<void> {
    if (!(buffer instanceof ArrayBuffer)) this.inputReader = buffer.getReader();
    workletReady ??= this.context.audioWorklet.addModule(workletURL).catch((error) => { workletReady = null; throw error; });
    await workletReady;
    if (this.disposed) return;
    this.worker = createWorker();
    this.worker.onerror = (event) => this.fail(new Error(event.message || '音频解码器加载失败'));
    this.worker.onmessageerror = () => this.fail(new Error('音频解码器返回了无法读取的数据'));
    this.worker.onmessage = ({ data }: MessageEvent<DecodeResponse>) => {
      if (this.disposed || ('fileId' in data && data.fileId !== 1)) return;
      try {
        this.onDecodeResponse(data);
      } catch (error) {
        this.fail(error);
      }
    };
    if (buffer instanceof ArrayBuffer) {
      this.worker.postMessage({ type: 'open', fileId: 1, buffer, base } satisfies DecodeRequest, [buffer]);
    } else {
      this.worker.postMessage({ type: 'open-stream', fileId: 1 } satisfies DecodeRequest);
      await this.readInput();
    }
  }

  private async readInput(): Promise<void> {
    const reader = this.inputReader!;
    try {
      while (!this.disposed) {
        const { value, done } = await reader.read();
        if (this.disposed) return;
        if (done) {
          this.worker?.postMessage({ type: 'end-stream', fileId: 1 } satisfies DecodeRequest);
          return;
        }
        const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
        // 解码器消费一块后再读取下一块，避免主线程堆积整首压缩文件。
        await new Promise<void>((resolve, reject) => {
          this.resolveInput = resolve;
          this.rejectInput = reject;
          this.worker!.postMessage({ type: 'append-stream', fileId: 1, buffer } satisfies DecodeRequest, [buffer]);
        });
      }
    } finally {
      reader.releaseLock();
      if (this.inputReader === reader) this.inputReader = null;
    }
  }

  private onDecodeResponse(data: DecodeResponse): void {
    switch (data.type) {
      case 'input-ready':
        this.resolveInput?.();
        this.resolveInput = this.rejectInput = null;
        break;
      case 'output': {
        if (this.info) throw new Error('音轨中途变更输出布局');
        // A decoder retry may offer only stereo after a multichannel attempt.
        const multichannel = this.outputChannels > 2 || data.layouts.some((count) => count > 2);
        const layouts = this.preserveMultichannel && multichannel
          ? data.layouts.filter((count) => count > 2) : data.layouts;
        const channels = this.configureOutput(layouts);
        this.worker?.postMessage({ type: 'output', fileId: 1, channels } satisfies DecodeRequest);
        break;
      }
      case 'info':
        if (!this.node) this.configureOutput([2]);
        if ((data.info.channels ?? 2) !== this.outputChannels)
          throw new Error('音频解码器的声道数与输出布局不一致');
        this.info = data.info;
        this.send({ type: 'configure', fileId: 1, info: data.info });
        break;
      case 'chunk': {
        if (!this.info || data.chunk.channels.length !== this.outputChannels ||
            data.chunk.channels.some((channel) => channel.length !== data.chunk.channels[0].length))
          throw new Error('PCM 音频块的声道数或长度不一致');
        const hasSamples = data.chunk.channels[0].length > 0;
        this.addChunk(data.chunk);
        if (this.loadState === 'loading' && hasSamples) {
          this.loadState = 'loaded';
          this.resolveReady?.();
          this.resolveReady = null;
          this.rejectReady = null;
        }
        break;
      }
      case 'progress': this.progress(Math.floor(data.progress * 100)); break;
      case 'complete':
        if (this.loadState === 'loading') {
          this.fail(new Error('音频解码器未返回采样'));
          break;
        }
        this.worker?.terminate();
        this.worker = null;
        this.progress(100);
        break;
      case 'error': this.fail(new Error(`音频解码失败：${data.message}`)); break;
    }
  }

  private configureOutput(layouts: readonly number[]): number {
    const destination = this.context.destination;
    this.disconnectOutput();
    for (const channels of layouts) {
      if (channels > 2 && channels > destination.maxChannelCount) continue;
      let node: AudioWorkletNode | undefined;
      try {
        // Stereo also works on mono hardware through Web Audio's normal downmix.
        const count = channels === 2 && destination.maxChannelCount === 1 ? 1 : channels;
        if (destination.channelCount !== count) destination.channelCount = count;
        if (destination.channelCount !== count) continue;
        destination.channelInterpretation = count > 6 ? 'discrete' : 'speakers';
        node = new AudioWorkletNode(this.context, 'nac-audio', {
          numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [channels],
        });
        node.connect(this.gain);
        this.gain.connect(destination);
      } catch (error) {
        node?.port.close();
        node?.disconnect();
        if (channels === 2) throw error;
        continue;
      }
      this.node = node;
      this.outputChannels = channels;
      node.onprocessorerror = () => this.fail(new Error('PCM 音频线程发生错误'));
      node.port.onmessage = ({ data }: MessageEvent<PlaybackState>) => {
        if (this.disposed || data.revision < this.revision || !this.info) return;
        this.position = data.position / this.info.rate;
        if (data.contextTime !== undefined) {
          this.outputClock.push({ ...data, contextTime: data.contextTime, position: this.position });
        }
        const audible = this.outputClock.read(outputContextTime(this.context, performance.now()));
        this.setWaiting(this.desiredPlaying && audible.waiting);
        if (audible.ended && this.desiredPlaying) {
          this.desiredPlaying = false;
          this.emit('end');
        }
      };
      return channels;
    }
    throw new Error('浏览器无法建立 PCM 音频输出');
  }

  private disconnectOutput(): void {
    if (this.node) {
      this.node.port.postMessage({ type: 'dispose' } satisfies PlaybackCommand);
      this.node.port.onmessage = null;
      this.node.disconnect();
      this.node = null;
    }
    this.gain.disconnect();
  }

  private addChunk(chunk: PCMChunk): void {
    // 主线程不保留 PCM；直接移交音频线程，避免两份全曲缓存。
    this.send({ type: 'chunk', fileId: 1, chunk }, chunk.channels.map((channel) => channel.buffer));
  }
  private send(command: PlaybackCommand, transfer: Transferable[] = []): void {
    if (!this.disposed) this.node?.port.postMessage(command, transfer);
  }
  private abort = (): void => {
    this.rejectReady?.(this.signal.reason ?? new DOMException('已取消', 'AbortError'));
    this.rejectReady = null;
    this.unload();
  };
  private fail(error: unknown): void {
    if (this.disposed) return;
    this.rejectReady?.(error);
    this.rejectReady = null;
    console.error('PCM 音频解码失败', error);
    this.emit('loaderror', null, 3, error);
    this.unload();
  }
  private emit(event: string, ...args: any[]): void {
    if (!this.disposed) for (const callback of [...(this.handlers.get(event) ?? [])]) callback(...args);
  }
  private setWaiting(waiting: boolean): void {
    if (waiting === this.waiting) return;
    this.waiting = waiting;
    this.emit(waiting ? 'waiting' : 'playing');
  }
  on(event: string, callback: Handler): this {
    const callbacks = this.handlers.get(event) ?? new Set<Handler>();
    callbacks.add(callback);
    this.handlers.set(event, callbacks);
    return this;
  }
  once(event: string, callback: Handler): this {
    const once: Handler = (...args) => { this.off(event, once); callback(...args); };
    this.on(event, once);
    // 首块先于引擎监听器就绪；异步补发 load，保证恢复进度和自动播放只执行一次。
    if (event === 'load' && this.loadState === 'loaded') setTimeout(() => this.emit('load'), 0);
    return this;
  }
  off(event: string, callback?: Handler): this {
    if (callback) this.handlers.get(event)?.delete(callback);
    else this.handlers.delete(event);
    return this;
  }
  play(): this {
    if (this.disposed || this.desiredPlaying) return this;
    this.desiredPlaying = true;
    const request = ++this.playRequest;
    void this.context.resume().then(() => {
      if (!this.disposed && this.desiredPlaying && request === this.playRequest) {
        this.outputClock.reset(this.position);
        this.setWaiting(true);
        this.send({ type: 'play', fileId: 1 });
        this.emit('play');
      }
    }).catch((error) => {
      if (request !== this.playRequest || this.disposed) return;
      this.desiredPlaying = false;
      this.emit('playerror', null, error);
    });
    return this;
  }
  pause(): this {
    const wasPlaying = this.desiredPlaying;
    this.desiredPlaying = false;
    this.playRequest++;
    this.send({ type: 'pause', fileId: 1 });
    if (wasPlaying) this.emit('pause');
    return this;
  }
  stop(): this {
    this.desiredPlaying = false;
    this.playRequest++;
    this.send({ type: 'pause', fileId: 1 });
    this.seek(0);
    return this;
  }
  unload(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.desiredPlaying = false;
    this.loadState = 'unloaded';
    this.rejectInput?.(new DOMException('已取消音频读取', 'AbortError'));
    this.resolveInput = this.rejectInput = null;
    void this.inputReader?.cancel().catch(() => {});
    this.signal.removeEventListener('abort', this.abort);
    clearTimeout(this.fadeTimer);
    this.worker?.terminate();
    this.worker = null;
    this.disconnectOutput();
    this.handlers.clear();
  }
  playing(): boolean { return !this.disposed && this.desiredPlaying && this.context.state === 'running'; }
  state(): string { return this.loadState; }
  duration(): number { return this.info?.duration ?? 0; }
  seek(): number;
  seek(value: number): this;
  seek(value?: number): number | this {
    if (value === undefined) return this.desiredPlaying
      ? this.outputClock.read(outputContextTime(this.context, performance.now())).position
      : this.position;
    this.position = Math.max(0, Math.min(this.duration(), value));
    this.outputClock.reset(this.position);
    if (this.desiredPlaying) this.setWaiting(true);
    const sample = Math.floor(this.position * (this.info?.rate ?? 44100));
    this.send({ type: 'seek', fileId: 1, sample, revision: ++this.revision });
    this.worker?.postMessage({ type: 'seek', fileId: 1, sample } satisfies DecodeRequest);
    return this;
  }
  volume(): number;
  volume(value: number): this;
  volume(value?: number): number | this {
    if (value === undefined) return this.gain.gain.value;
    clearTimeout(this.fadeTimer);
    this.currentVolume = Math.max(0, Math.min(1, value));
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.gain.setValueAtTime(this.currentVolume, this.context.currentTime);
    return this;
  }
  rate(value: number): this {
    this.currentRate = Number.isFinite(value) && value > 0 ? value : 1;
    this.send({ type: 'rate', value: this.currentRate });
    return this;
  }
  fade(from: number, to: number, duration: number): this {
    this.volume(from);
    this.currentVolume = to;
    this.gain.gain.linearRampToValueAtTime(to, this.context.currentTime + Math.max(0, duration) / 1000);
    this.fadeTimer = setTimeout(() => this.emit('fade'), Math.max(0, duration));
    return this;
  }
}
