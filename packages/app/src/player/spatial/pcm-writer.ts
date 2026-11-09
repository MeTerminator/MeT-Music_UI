import { PCM_BLOCK_SAMPLES } from "../nac/types";
import type { DecodeResponse, StereoChannels } from "../nac/types";

/** Transfer fixed-size stereo blocks to the existing AudioWorklet cache. */
export class StereoPcmWriter {
  written = 0;
  private channels: StereoChannels;

  constructor(private readonly fileId: number, readonly samples: number, readonly rate: number) {
    if (!Number.isSafeInteger(samples) || samples <= 0 || !Number.isFinite(rate) || rate <= 0)
      throw new Error("无效的音频采样参数");
    this.channels = this.allocate();
    const blocks = Math.ceil(samples / PCM_BLOCK_SAMPLES);
    this.send({ type: "info", fileId, info: { samples, rate, blocks, duration: samples / rate, delay: 0 } });
  }

  private send(data: DecodeResponse, transfer: Transferable[] = []) {
    self.postMessage(data, { transfer });
  }

  private allocate(): StereoChannels {
    const length = Math.min(PCM_BLOCK_SAMPLES, this.samples - this.written);
    return [new Float32Array(length), new Float32Array(length)];
  }

  write(left: number, right: number) {
    const index = this.written % PCM_BLOCK_SAMPLES;
    this.channels[0][index] = left;
    this.channels[1][index] = right;
    this.written++;
    if (index + 1 !== this.channels[0].length) return;

    const offset = this.written - this.channels[0].length;
    this.send({
      type: "chunk", fileId: this.fileId,
      chunk: { block: offset / PCM_BLOCK_SAMPLES, offset, channels: this.channels },
    }, [this.channels[0].buffer, this.channels[1].buffer]);
    if (this.written < this.samples) this.channels = this.allocate();
  }

  complete() {
    if (this.written !== this.samples) throw new Error("音频解码不完整");
    this.send({ type: "complete", fileId: this.fileId });
  }
}
