import { describe, expect, it } from "vitest";
import { FLACDecoder } from "@wasm-audio-decoders/flac";
import { finalFlacFrame } from "../src/player/spatial/flac-tail";

// QQ FLAC 文件最后的短帧（2923 个静音采样）及其额外尾部数据。
const tail = Uint8Array.from([255, 248, 121, 24, 224, 162, 163, 11, 106, 229,
  0, 0, 0, 0, 0, 0, 81, 179, 240, 0, 255, 15, 68, 68, 64, 72, 70, 60, 54, 14, 85, 255, 240]);

describe("FLAC 额外尾部数据", () => {
  it("保留 CRC 正确的完整末帧并恢复实际缺少的采样", async () => {
    const frame = finalFlacFrame(tail, 2923);
    expect(frame).toEqual(tail.subarray(0, 18));
    const decoder = new FLACDecoder();
    try {
      await decoder.ready;
      const decoded = await decoder.decodeFrames([frame!]);
      expect(decoded.samplesDecoded).toBe(2923);
      expect(decoded.sampleRate).toBe(44100);
      expect(decoded.errors).toEqual([]);
    } finally { decoder.free(); }
  });
  it("拒绝采样数不匹配、截断和 CRC 损坏的末帧", () => {
    expect(finalFlacFrame(tail, 2922)).toBeUndefined();
    expect(finalFlacFrame(tail.subarray(0, 17), 2923)).toBeUndefined();
    const damaged = tail.slice();
    damaged[12] ^= 1;
    expect(finalFlacFrame(damaged, 2923)).toBeUndefined();
  });
});
