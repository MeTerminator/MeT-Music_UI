const BYTES_PER_SAMPLE = 3;
const MAX_DATA_BYTES = 384 * 1024 * 1024;
const CHANNEL_MASKS = new Map([
  [6, 0x60f], // L, R, C, LFE, side L/R
  [8, 0x63f], // 5.1 plus rear L/R before the side pair
  [10, 0x2d60f], // 5.1.4
  [12, 0x2d63f], // 7.1.4
]);

export function nativeWaveLayout(layouts: readonly number[], samples: number): number | undefined {
  return layouts.find((channels) =>
    CHANNEL_MASKS.has(channels) && samples * channels * BYTES_PER_SAMPLE <= MAX_DATA_BYTES);
}

/** WAVE_FORMAT_EXTENSIBLE, with interleaved signed 24-bit PCM in speaker-mask order. */
export class WaveWriter {
  private readonly parts: ArrayBuffer[];

  constructor(samples: number, rate: number, channels: number) {
    const mask = CHANNEL_MASKS.get(channels);
    if (mask === undefined || !nativeWaveLayout([channels], samples))
      throw new Error("无法封装此 WAV 声道布局或音轨长度");
    const blockSize = channels * BYTES_PER_SAMPLE;
    const dataSize = samples * blockSize;
    const header = new ArrayBuffer(68);
    const view = new DataView(header);
    view.setUint32(0, 0x52494646); // RIFF
    view.setUint32(4, 60 + dataSize, true);
    view.setUint32(8, 0x57415645); // WAVE
    view.setUint32(12, 0x666d7420); // fmt
    view.setUint32(16, 40, true);
    view.setUint16(20, 0xfffe, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * blockSize, true);
    view.setUint16(32, blockSize, true);
    view.setUint16(34, 24, true);
    view.setUint16(36, 22, true);
    view.setUint16(38, 24, true);
    view.setUint32(40, mask, true);
    new Uint8Array(header, 44, 16).set([1, 0, 0, 0, 0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113]);
    view.setUint32(60, 0x64617461); // data
    view.setUint32(64, dataSize, true);
    this.parts = [header];
  }

  write(channels: readonly Float32Array[]): void {
    const samples = channels[0].length;
    const pcm = new Uint8Array(samples * channels.length * BYTES_PER_SAMPLE);
    let offset = 0;
    for (let frame = 0; frame < samples; frame++) {
      for (const channel of channels) {
        const value = Math.max(-0x800000, Math.min(0x7fffff, Math.round(channel[frame] * 0x800000)));
        pcm[offset++] = value;
        pcm[offset++] = value >> 8;
        pcm[offset++] = value >> 16;
      }
    }
    this.parts.push(pcm.buffer);
  }

  finish(): Blob {
    return new Blob(this.parts, { type: "audio/wav" });
  }
}
