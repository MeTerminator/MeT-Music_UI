import { PCMPlayback } from './pcm-playback';
import type { PlaybackCommand } from './types';

declare const sampleRate: number;
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

/** 音频渲染独立于 UI 和解码 Worker，模型推理不能阻塞声卡回调。 */
class NACAudioProcessor extends AudioWorkletProcessor {
  private readonly playback = new PCMPlayback();
  private frames = 0;
  private wasWaiting = false;
  private wasPlaying = false;
  private disposed = false;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<PlaybackCommand>) => {
      this.playback.command(data);
      if (data.type === 'dispose') {
        this.disposed = true;
        this.port.close();
        return;
      }
      if (data.type !== 'chunk' && data.type !== 'volume') this.report();
    };
  }

  private report(): void {
    this.port.postMessage(this.playback.state());
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.disposed) return false;
    const output = outputs[0];
    if (!output) return true;
    this.playback.render(output, sampleRate);
    const state = this.playback.state();
    this.frames += output[0]?.length ?? 0;
    if (
      this.frames >= 2048 ||
      state.waiting !== this.wasWaiting ||
      state.playing !== this.wasPlaying
    ) {
      this.report();
      this.frames = 0;
    }
    this.wasWaiting = state.waiting;
    this.wasPlaying = state.playing;
    return true;
  }
}
registerProcessor('nac-audio', NACAudioProcessor);
