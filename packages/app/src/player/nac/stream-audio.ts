import type { PlayerAudio } from '@met/core';
import workletURL from './audio-worklet.ts?worker&url';
import type { AudioInfo, DecodeRequest, DecodeResponse, PCMChunk, PlaybackCommand, PlaybackState } from './types';

let context: AudioContext | null = null;
let workletReady: Promise<void> | null = null;
function audioContext(): AudioContext {
  if (!context || context.state === 'closed') {
    context = new AudioContext({ sampleRate: 44100 });
    workletReady = null;
  }
  return context;
}
/** 在取链前的用户手势内调用，不等待被浏览器挂起的 resume。 */
export function unlockNacAudio(): void {
  void audioContext().resume().catch(() => {});
}

type Handler = (...args: any[]) => void;

/** Howler 控制接口的 NAC 实现：PCM 缓存和采样时钟位于 AudioWorklet。 */
export class NacStreamAudio implements PlayerAudio {
  private readonly context = audioContext();
  private readonly gain = this.context.createGain();
  private node: AudioWorkletNode | null = null;
  private worker: Worker | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private loadState = 'loading';
  private disposed = false;
  private desiredPlaying = false;
  private playRequest = 0;
  private position = 0;
  private revision = 0;
  private currentVolume = 1;
  private currentRate = 1;
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  private info: AudioInfo | null = null;
  private rejectReady: ((error: unknown) => void) | null = null;
  private resolveReady: (() => void) | null = null;
  private readonly ready: Promise<void>;

  private constructor(private readonly signal: AbortSignal, private readonly progress: (percent: number) => void) {
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    this.gain.connect(this.context.destination);
    signal.addEventListener('abort', this.abort, { once: true });
  }

  static async open(buffer: ArrayBuffer, base: string, signal: AbortSignal, progress: (percent: number) => void): Promise<NacStreamAudio> {
    signal.throwIfAborted();
    const audio = new NacStreamAudio(signal, progress);
    // 初始化和推理可在 suspended 上下文中执行；无需播放权限即可预缓存。
    void audio.initialize(buffer, base).catch((error) => audio.fail(error));
    await audio.ready;
    return audio;
  }

  private async initialize(buffer: ArrayBuffer, base: string): Promise<void> {
    workletReady ??= this.context.audioWorklet.addModule(workletURL).catch((error) => { workletReady = null; throw error; });
    await workletReady;
    if (this.disposed) return;
    this.node = new AudioWorkletNode(this.context, 'nac-audio', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
    });
    this.node.connect(this.gain);
    this.node.onprocessorerror = () => this.fail(new Error('NAC 音频线程发生错误'));
    this.node.port.onmessage = ({ data }: MessageEvent<PlaybackState>) => {
      if (this.disposed || data.revision < this.revision || !this.info) return;
      this.position = data.position / this.info.rate;
      if (data.ended && this.desiredPlaying) {
        this.desiredPlaying = false;
        this.emit('end');
      }
    };
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onerror = (event) => this.fail(new Error(event.message || 'NAC 解码器加载失败'));
    this.worker.onmessageerror = () => this.fail(new Error('NAC 解码器返回了无法读取的数据'));
    this.worker.onmessage = ({ data }: MessageEvent<DecodeResponse>) => {
      if (this.disposed || ('fileId' in data && data.fileId !== 1)) return;
      switch (data.type) {
        case 'info':
          this.info = data.info;
          this.send({ type: 'configure', fileId: 1, info: data.info });
          break;
        case 'chunk': {
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
          this.worker?.terminate();
          this.worker = null;
          this.progress(100);
          break;
        case 'error': this.fail(new Error(`NAC 解码失败：${data.message}`)); break;
      }
    };
    this.worker.postMessage({ type: 'open', fileId: 1, buffer, base } satisfies DecodeRequest & { base: string }, [buffer]);
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
    this.emit('loaderror', null, 3);
    this.unload();
  }
  private emit(event: string, ...args: any[]): void {
    if (!this.disposed) for (const callback of [...(this.handlers.get(event) ?? [])]) callback(...args);
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
    this.signal.removeEventListener('abort', this.abort);
    clearTimeout(this.fadeTimer);
    this.worker?.terminate();
    this.worker = null;
    this.node?.port.postMessage({ type: 'dispose' } satisfies PlaybackCommand);
    this.node?.disconnect();
    if (this.node) this.node.port.onmessage = null;
    this.node = null;
    this.gain.disconnect();
    this.handlers.clear();
  }
  playing(): boolean { return !this.disposed && this.desiredPlaying && this.context.state === 'running'; }
  state(): string { return this.loadState; }
  duration(): number { return this.info?.duration ?? 0; }
  seek(): number;
  seek(value: number): this;
  seek(value?: number): number | this {
    if (value === undefined) return this.position;
    this.position = Math.max(0, Math.min(this.duration(), value));
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
