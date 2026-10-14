import { describe, expect, it } from "vitest";
import { prepareAmllLines } from "../src/lyrics/amll-timestamps";

const line = (startTime: number, endTime: number) => ({
  startTime, endTime, translatedLyric: "翻译", isDuet: true,
  words: [{ startTime, endTime, word: "短句", obscene: false }],
});

describe("AMLL rendering timestamps", () => {
  it("clamps a short line after the 250ms offset without shortening its words", () => {
    const source = [line(1263, 1496)];
    const result = prepareAmllLines(source, 250);
    expect(result[0].endTime).toBe(1263);
    expect(result[0].words[0].endTime).toBe(1496);
    expect(source[0].endTime).toBe(1496);
  });

  it("preserves the offset for normal lines and leaves TTML timing unchanged without an offset", () => {
    const source = [line(1000, 3000)];
    expect(prepareAmllLines(source, 250)[0].endTime).toBe(2750);
    expect(prepareAmllLines(source)[0]).toEqual(source[0]);
    expect(prepareAmllLines(source)[0].words[0]).not.toBe(source[0].words[0]);
  });

  it("repairs reversed, negative and non-finite timestamps including ruby text", () => {
    const source = [{ ...line(-100, Infinity), words: [
      { startTime: 1263, endTime: 1246, word: "文字", ruby: [{ startTime: NaN, endTime: -1, word: "注音" }] },
      { startTime: NaN, endTime: Infinity, word: "缺失时间" },
    ] }];
    const result = prepareAmllLines(source);
    expect(result[0].startTime).toBe(0);
    expect(result[0].endTime).toBe(1263);
    expect(result[0].words[0].endTime).toBe(1263);
    expect(result[0].words[0].ruby?.[0]).toEqual({ startTime: 1263, endTime: 1263, word: "注音" });
    expect(result[0].words[1]).toMatchObject({ startTime: 0, endTime: 0 });
    expect(source[0].words[0].endTime).toBe(1246);
  });

  it("allows empty and zero-duration lines and clamps an oversized offset to zero", () => {
    expect(prepareAmllLines([])).toEqual([]);
    expect(prepareAmllLines([{ startTime: 0, endTime: 0, words: [] }], 2000)).toEqual([{ startTime: 0, endTime: 0, words: [] }]);
  });
});
