import { blockForSample } from './nac';
import type { AudioInfo, PCMChunk, PlaybackCommand, PlaybackState } from './types';

/**
 * 音频线程的随机访问 PCM 缓存。遇到尚未解码的片段时保持采样位置不动，
 * 输出静音并报告 waiting；片段到达后自动继续，不能跨过空洞播放。
 */
export class PCMPlayback {
  private info: AudioInfo | null = null;
  private readonly chunks = new Map<number, PCMChunk>();
  private fileId = 0;
  private revision = 0;
  private position = 0;
  private playing = false;
  private waiting = false;
  private volume = 1;
  private rate = 1;

  command(message: PlaybackCommand): void {
    if (message.type === 'dispose') {
      this.command({ type: 'clear', fileId: this.fileId + 1 });
      return;
    }
    if (message.type === 'rate') {
      this.rate = Number.isFinite(message.value) && message.value > 0 ? message.value : 1;
      return;
    }
    if (message.type === 'volume') {
      this.volume = Math.min(1, Math.max(0, message.value));
      return;
    }
    if (message.type === 'clear') {
      this.fileId = message.fileId;
      this.info = null;
      this.position = 0;
      this.playing = false;
      this.waiting = false;
      this.revision = 0;
      this.chunks.clear();
      return;
    }
    if (message.type === 'configure') {
      this.revision = 0;
      this.info = message.info;
      this.fileId = message.fileId;
      this.position = 0;
      this.playing = false;
      this.waiting = false;
      this.chunks.clear();
      return;
    }
    if (message.fileId !== this.fileId || !this.info) return;
    switch (message.type) {
      case 'chunk':
        this.chunks.set(message.chunk.block, message.chunk);
        break;
      case 'seek':
        if (message.revision < this.revision) return;
        this.revision = message.revision;
        this.position = Math.min(this.info.samples, Math.max(0, message.sample));
        this.waiting = false;
        break;
      case 'play':
        if (this.position >= this.info.samples) this.position = 0;
        this.playing = true;
        break;
      case 'pause':
        this.playing = false;
        this.waiting = false;
        break;
    }
  }

  state(): PlaybackState {
    return {
      fileId: this.fileId,
      revision: this.revision,
      position: this.position,
      playing: this.playing,
      waiting: this.waiting,
      ended: this.info !== null && this.position >= this.info.samples,
    };
  }

  render(output: Float32Array[], outputRate: number): void {
    for (const channel of output) channel.fill(0);
    if (!this.info || !this.playing || output.length !== (this.info.channels ?? 2)) return;
    this.waiting = false;
    // 在音频线程中保持连续的小数相位，适配 44.1 kHz 文件与 48 kHz 声卡。
    // 不把每块作为独立音源重采样，避免块边界丢失相位或重复采样。
    const step = (this.info.rate / outputRate) * this.rate;
    for (let frame = 0; frame < output[0].length; frame++) {
      if (this.position >= this.info.samples) {
        this.playing = false;
        break;
      }
      const index = Math.floor(this.position);
      const fraction = this.position - index;
      const next = Math.min(index + 1, this.info.samples - 1);
      const chunk = this.chunks.get(blockForSample(this.info, index));
      const nextChunk = fraction === 0 ? chunk : this.chunks.get(blockForSample(this.info, next));
      const offset = index - (chunk?.offset ?? 0);
      const nextOffset = next - (nextChunk?.offset ?? 0);
      if (!chunk || !nextChunk || offset < 0 || offset >= chunk.channels[0].length ||
          (fraction !== 0 && (nextOffset < 0 || nextOffset >= nextChunk.channels[0].length))) {
        this.waiting = true;
        break;
      }
      for (let channel = 0; channel < output.length; channel++) {
        const sample = chunk.channels[channel][offset];
        const nextSample = fraction === 0 ? sample : nextChunk.channels[channel][nextOffset];
        output[channel][frame] = (sample + (nextSample - sample) * fraction) * this.volume;
      }
      this.position = Math.min(this.info.samples, this.position + step);
    }
    if (this.position >= this.info.samples) {
      this.playing = false;
      this.waiting = false;
    }
  }
}
