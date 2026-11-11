import { FLACDecoder, type FLACDecodedAudio } from "@wasm-audio-decoders/flac";
import { errorMessage, type DecodeRequest, type DecodeResponse } from "../nac/types";
import { bedLayouts, bedMix, type PcmMix } from "./pcm-mix";
import { PcmWriter, requestPcmOutput } from "./pcm-writer";
import { finalFlacFrame } from "./flac-tail";

class FlacInput {
  private prefix: Uint8Array = new Uint8Array(0);
  private decoder?: FLACDecoder;
  private writer?: PcmWriter;
  private mix?: PcmMix;
  private samples = 0;
  private channels = 0;
  private rate = 0;
  private sourceOrder: number[] | null = null;
  private tail: Uint8Array = new Uint8Array(0);
  private tailLimit = 64 * 1024;
  private maxBlock = 0;

  constructor(private readonly fileId: number, private readonly wave = false) {}

  async append(bytes: Uint8Array) {
    if (!this.decoder) {
      if (this.prefix.length) {
        const combined = new Uint8Array(this.prefix.length + bytes.length);
        combined.set(this.prefix);
        combined.set(bytes, this.prefix.length);
        bytes = combined;
      }
      // HTTP 数据块可以在 FLAC 头部任意字节处分界。
      if (bytes.length < 42) { this.prefix = bytes; return; }
      this.prefix = new Uint8Array(0);
      const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (header.getUint32(0) !== 0x664c6143 || (header.getUint32(4) & 0x7fffffff) !== 34)
        throw new Error("FLAC 音轨缺少 STREAMINFO");
      const streamInfo = header.getBigUint64(18);
      this.samples = Number(streamInfo & ((1n << 36n) - 1n));
      this.channels = Number((streamInfo >> 41n) & 7n) + 1;
      this.rate = Number(streamInfo >> 44n);
      this.maxBlock = header.getUint16(10);
      const maxFrame = (header.getUint8(15) << 16) | (header.getUint8(16) << 8) | header.getUint8(17);
      this.tailLimit = (maxFrame || this.maxBlock * this.channels * 4) + 64;
      if (!this.samples || !this.rate || ![1, 2, 6, 8].includes(this.channels))
        throw new Error("FLAC 音轨的长度或声道布局不受支持");
      const output = await requestPcmOutput(this.fileId, bedLayouts(this.channels), this.samples);
      this.mix = bedMix(this.channels, output);
      this.sourceOrder = this.channels === 8 ? [0, 1, 2, 3, 6, 7, 4, 5] : null;
      this.decoder = new FLACDecoder();
      await this.decoder.ready;
    }
    const tail = new Uint8Array(Math.min(this.tailLimit, this.tail.length + bytes.length));
    const fromOld = Math.max(0, tail.length - bytes.length);
    if (fromOld) tail.set(this.tail.subarray(this.tail.length - fromOld));
    tail.set(bytes.subarray(Math.max(0, bytes.length - tail.length)), fromOld);
    this.tail = tail;
    this.write(await this.decoder.decode(bytes));
  }

  private write({ channelData, samplesDecoded, sampleRate, errors }: FLACDecodedAudio) {
    if (errors.length) throw new Error(errors[0].message);
    if (!samplesDecoded) return;
    if (sampleRate !== this.rate || channelData.length !== this.channels ||
        samplesDecoded > this.samples - (this.writer?.written ?? 0))
      throw new Error("FLAC 音轨与 STREAMINFO 不一致");
    this.writer ??= new PcmWriter(this.fileId, this.samples, this.rate, this.mix!, this.wave);
    this.writer.write(samplesDecoded, (frame, channel) =>
      channelData[this.sourceOrder?.[channel] ?? channel][frame]);
  }

  async finish() {
    if (!this.decoder) throw new Error("FLAC 音轨缺少 STREAMINFO");
    this.write(await this.decoder.flush());
    const missing = this.samples - (this.writer?.written ?? 0);
    if (missing > 0 && missing <= this.maxBlock) {
      const frame = finalFlacFrame(this.tail, missing);
      if (frame) {
        const decoded = await this.decoder.decodeFrames([frame]);
        if (decoded.samplesDecoded === missing) this.write(decoded);
      }
    }
    if (!this.writer) throw new Error("FLAC 音轨为空");
    this.writer.complete();
    this.free();
  }

  free() { this.decoder?.free(); this.decoder = undefined; }
}

let input: FlacInput | undefined;
let pending = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<DecodeRequest>) => {
  // output 由 requestPcmOutput 的独立监听器处理，不能排在等待它的任务后面。
  if (!["open", "open-stream", "append-stream", "end-stream"].includes(data.type)) return;
  pending = pending.then(async () => {
    if (data.type === "open") {
      input?.free();
      input = new FlacInput(data.fileId, data.wave);
      const bytes = new Uint8Array(data.buffer);
      for (let offset = 0; offset < bytes.length; offset += 64 * 1024)
        await input.append(bytes.subarray(offset, offset + 64 * 1024));
      await input.finish();
    } else if (data.type === "open-stream") {
      input?.free();
      input = new FlacInput(data.fileId);
    } else if (data.type === "append-stream") {
      if (!input) throw new Error("FLAC 流未初始化");
      await input.append(new Uint8Array(data.buffer));
      self.postMessage({ type: "input-ready", fileId: data.fileId } satisfies DecodeResponse);
    } else if (data.type === "end-stream") {
      if (!input) throw new Error("FLAC 流未初始化");
      await input.finish();
    }
  }).catch((error) => {
    input?.free();
    input = undefined;
    self.postMessage({
      type: "error", fileId: "fileId" in data ? data.fileId : null, message: errorMessage(error),
    } satisfies DecodeResponse);
  });
};
