import { describe, expect, it } from "vitest";
import { PCMPlayback } from "../src/player/nac/pcm-playback";
import { bedLayouts, bedMix, mpegHOutputMix } from "../src/player/spatial/pcm-mix";
import { nativeWaveLayout, WaveWriter } from "../src/player/spatial/wave";

describe("spatial PCM", () => {
  it("offers full and reduced layouts without inventing extra channels for 5.1", () => {
    expect(bedLayouts(6)).toEqual([6, 2]);
    expect(bedLayouts(12)).toEqual([12, 8, 6, 2]);
    expect(bedLayouts(16)).toEqual([16, 8, 6, 2]);
  });

  it("preserves LFE and puts rear and side pairs in device order", () => {
    expect(bedMix(12, 12).map((row) => row[0][0])).toEqual([0, 1, 2, 3, 6, 7, 4, 5, 8, 9, 10, 11]);
    expect(mpegHOutputMix(8)).toEqual(bedMix(8, 8));
    expect(bedMix(12, 6)[3]).toEqual([[3, 1]]);
    expect(bedMix(12, 6).flatMap((row) => row.map(([channel]) => channel)).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it("packages the 7.1.4 speaker layout and writes signed 24-bit samples in channel order", async () => {
    const writer = new WaveWriter(1, 48_000, 12);
    writer.write([1, -1, 0.5, -0.5, ...Array<number>(8).fill(0)].map((value) => new Float32Array([value])));
    const wave = await writer.finish().arrayBuffer();
    const header = new DataView(wave);
    expect(header.getUint16(20, true)).toBe(0xfffe);
    expect(header.getUint16(22, true)).toBe(12);
    expect(header.getUint32(40, true)).toBe(0x2d63f);
    expect(header.getUint32(64, true)).toBe(36);
    expect([...new Uint8Array(wave, 68, 12)]).toEqual([
      0xff, 0xff, 0x7f, 0x00, 0x00, 0x80, 0x00, 0x00, 0x40, 0x00, 0x00, 0xc0,
    ]);
    expect(nativeWaveLayout(bedLayouts(12), 9_181_551)).toBe(12);
    expect(nativeWaveLayout(bedLayouts(12), 12_000_000)).toBe(8);
    expect(nativeWaveLayout(bedLayouts(16), 6_811_598)).toBe(8);
    expect(nativeWaveLayout(bedLayouts(6), 25_000_000)).toBeUndefined();
  });

  it("folds center and surrounds into stereo with headroom and omits LFE", () => {
    const gain = 1 / (1 + 2 * Math.SQRT1_2);
    expect(bedMix(6, 2)).toEqual([
      [[0, gain], [2, Math.SQRT1_2 * gain], [4, Math.SQRT1_2 * gain]],
      [[1, gain], [2, Math.SQRT1_2 * gain], [5, Math.SQRT1_2 * gain]],
    ]);
    for (const source of [8, 10, 12, 16]) {
      for (const output of bedLayouts(source)) {
        for (const row of bedMix(source, output, true))
          expect(row.reduce((sum, [, weight]) => sum + weight, 0)).toBeCloseTo(1);
      }
    }
  });

  it("resamples six independent channels at the same playback position", () => {
    const playback = new PCMPlayback();
    playback.command({ type: "configure", fileId: 1, info: {
      samples: 2, blocks: 1, rate: 4, duration: 0.5, delay: 0, channels: 6,
    } });
    playback.command({ type: "chunk", fileId: 1, chunk: {
      block: 0, offset: 0,
      channels: Array.from({ length: 6 }, (_, channel) => new Float32Array([0, (channel + 1) / 8])),
    } });
    playback.command({ type: "play", fileId: 1 });
    const output = Array.from({ length: 6 }, () => new Float32Array(4));
    playback.render(output, 8);
    expect(output.map((channel) => channel[1])).toEqual([1, 2, 3, 4, 5, 6].map((n) => n / 16));
    expect(playback.state()).toMatchObject({ position: 2, ended: true });
  });
});
