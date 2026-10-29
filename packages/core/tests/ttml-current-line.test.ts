import { describe, expect, it } from "vitest";
import { getTtmlCurrentLyric } from "../src/lyrics/ttml-current-line";
import type { ParsedLyric } from "../src/types/song";

type Line = NonNullable<ParsedLyric["ttml"]>[number];
const line = (
  text: string,
  startTime: number,
  extra: Partial<Line> = {},
): Line => ({
  startTime,
  endTime: startTime + 2000,
  words: [{ word: text, startTime, endTime: startTime + 2000, romanWord: "" }],
  translatedLyric: `${text}翻译`,
  romanLyric: "",
  isBG: false,
  isDuet: false,
  ...extra,
});

describe("TTML 桌面当前行", () => {
  const main = line("主唱", 1000);
  const duet = line("对唱", 1500, { isDuet: true });
  const background = line("背景", 1800, { isBG: true });

  it("重叠演唱选后触发的对唱，忽略更晚触发的背景人声", () => {
    expect(getTtmlCurrentLyric([main, duet, background], 2000)).toEqual({
      lyricText: "对唱",
      lyricTrans: "对唱翻译",
      lyricData: [{ content: "对唱", percent: 0.25 }],
    });
  });

  it("按时间选择而非数组顺序，并在后续主唱触发时替换对唱", () => {
    expect(
      getTtmlCurrentLyric([line("后续主唱", 2500), duet, main], 2500).lyricText,
    ).toBe("后续主唱");
    expect(getTtmlCurrentLyric([duet, main], 2000).lyricText).toBe("对唱");
  });

  it("触发边界包含起始时间，同时间触发取后面的行", () => {
    expect(getTtmlCurrentLyric([main], 1000).lyricData).toEqual([
      { content: "主唱", percent: 0 },
    ]);
    expect(
      getTtmlCurrentLyric(
        [main, line("同时对唱", 1000, { isDuet: true })],
        1000,
      ).lyricText,
    ).toBe("同时对唱");
  });

  it("前奏和仅背景人声时输出空歌词", () => {
    const empty = { lyricText: "", lyricTrans: "", lyricData: [] };
    expect(getTtmlCurrentLyric([main, background], 999)).toEqual(empty);
    expect(getTtmlCurrentLyric([background], 2000)).toEqual(empty);
  });

  it("间奏保留最近一行，倒退后重新选择较早的行", () => {
    expect(
      getTtmlCurrentLyric([main, duet, background], 8000).lyricData,
    ).toEqual([{ content: "对唱", percent: 1 }]);
    expect(getTtmlCurrentLyric([main, duet, background], 1200).lyricText).toBe(
      "主唱",
    );
  });

  it("逐字内容及进度使用 TTML 时间，零时长字不产生 NaN", () => {
    const words = [
      {
        word: "你",
        startTime: 1000,
        endTime: 1500,
        romanWord: "",
        obscene: false,
      },
      {
        word: "好",
        startTime: 1500,
        endTime: 2500,
        romanWord: "",
        obscene: false,
      },
      {
        word: "！",
        startTime: 2500,
        endTime: 2500,
        romanWord: "",
        obscene: false,
      },
    ];
    expect(
      getTtmlCurrentLyric([line("", 1000, { words })], 2000).lyricData,
    ).toEqual([
      { content: "你", percent: 1 },
      { content: "好", percent: 0.5 },
      { content: "！", percent: 0 },
    ]);
    expect(
      getTtmlCurrentLyric([line("", 1000, { words })], 2500).lyricData[2]
        ?.percent,
    ).toBe(1);
  });
});
