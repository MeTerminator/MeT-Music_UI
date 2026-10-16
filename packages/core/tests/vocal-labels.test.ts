import { describe, expect, it } from "vitest";
import { emptyLyric } from "../src/types/song";
import { stripVocalLabels, stripVocalWords } from "../src/lyrics/vocal-labels";
import { parseLyric, parseLocalLrc, type LyricApiData } from "../src/lyrics/parse";

describe("男/女/合标签", () => {
  it.each(["男：", "女：", "合：", "男:", "女:", "合:"])("过滤只有 %s 的行，忽略首尾空白", async (label) => {
    const result = await parseLyric({ lrc: `[00:01.00]  ${label}  \n[00:03.00]正文`, lrctrans: "[00:01.00]标签\n[00:03.00]正确翻译" }, null, {
      removeInfo: false, removeAMInfo: false,
    });
    expect(result?.lrc).toEqual([{ time: 3, content: "正文", tran: "正确翻译" }]);
    expect(result?.lrcAM?.map((line) => line.translatedLyric)).toEqual(["正确翻译"]);
  });

  it("跨词的标签和空白删除后，时长并入第一个正文词且总时长不变", () => {
    const words = [" ", "男", ":", " ", "你", "好", " "].map((word, index) => ({
      word, startTime: 1000 + index * 100, endTime: 1100 + index * 100, romanWord: `roma${index}`,
    }));
    const original = structuredClone(words);
    expect(stripVocalWords(words)).toEqual([
      { word: "你", startTime: 1000, endTime: 1600, romanWord: "roma4" },
      { word: "好", startTime: 1600, endTime: 1700, romanWord: "roma5" },
    ]);
    expect(words).toEqual(original);
  });

  it("标签与正文在同一个词时保留该词完整时间", () => {
    expect(stripVocalWords([{ word: " 女：你好 ", startTime: 1000, endTime: 3000, romanWord: "ni hao" }]))
      .toEqual([{ word: "你好", startTime: 1000, endTime: 3000, romanWord: "ni hao" }]);
  });

  it("删除中段标签时把时长合并到首词，时间轴保持有序且总时长不变", () => {
    const words = ["你", "男：", "好"].map((word, index) => ({ word, startTime: index * 100, endTime: (index + 1) * 100 }));
    expect(stripVocalWords(words)).toEqual([
      { word: "你", startTime: 0, endTime: 200 }, { word: "好", startTime: 200, endTime: 300 },
    ]);
  });

  for (const platform of ["qq", "netease"] as const) {
    it(`${platform} 逐字标签在配对后处理，普通和 AM 过滤开关均不影响此规则`, async () => {
      const lines = ["男：", "女:你好", "合：世界", "没有标签"];
      const lrc = (texts: string[]) => texts.map((text, index) => `[00:${String(1 + index * 3).padStart(2, "0")}.00]${text}`).join("\n");
      const timed = lines.map((text, index) => {
        const start = 1000 + index * 3000;
        const words = [...text].map((char, offset) => platform === "qq"
          ? `${char}(${start + offset * 100},100)` : `(${start + offset * 100},100,0)${char}`).join("");
        return `[${start},${text.length * 100}]${words}`;
      }).join("\n");
      const translations = ["标签", "译一", "译二", "译三"];
      const data: LyricApiData = {
        lrc: lrc(lines), lrctrans: lrc(translations),
        ...(platform === "qq" ? { qrc: `[offset:0]\n${timed}`, qrctrans: lrc(translations) }
          : { yrc: timed, ytlrc: lrc(translations) }),
      };
      for (const removeInfo of [false, true]) {
        for (const removeAMInfo of [false, true]) {
          const result = await parseLyric(data, null, { platform, removeInfo, removeAMInfo });
          expect(result?.lrc.map((line) => [line.content, line.tran])).toEqual([["你好", "译一"], ["世界", "译二"], ["没有标签", "译三"]]);
          expect(result?.yrc.map((line) => [line.content.map((word) => word.content).join(""), line.tran]))
            .toEqual([["你好", "译一"], ["世界", "译二"], ["没有标签", "译三"]]);
          expect(result?.yrc[0].content[0]).toMatchObject({ time: 4, duration: 0.3, content: "你" });
          expect(result?.yrc[0].content[1]).toMatchObject({ time: 4.3, duration: 0.1, content: "好" });
          expect(result?.yrcAM?.map((line) => [line.words.map((word) => word.word).join(""), line.translatedLyric]))
            .toEqual([["你好", "译一"], ["世界", "译二"], ["没有标签", "译三"]]);
          expect(result?.yrcAM?.[0].words[0]).toMatchObject({ startTime: 4000, endTime: 4300, word: "你" });
        }
      }
    });
  }

  it("本地歌词同样清理标签，未命中标签的正文保持原样", () => {
    const result = parseLocalLrc("[00:01.00] 男： \n[00:03.00] 合:你好 \n[00:05.00]男女合唱：继续");
    expect(result?.lrc.map((line) => line.content)).toEqual(["你好", "男女合唱：继续"]);
  });
});


it("TTML 标签过滤保留行属性、翻译和逐字音译", () => {
  const result = emptyLyric();
  result.ttml = [
    { words: [{ word: "男：", startTime: 0, endTime: 100 }], startTime: 0, endTime: 100, translatedLyric: "标签", romanLyric: "", isBG: false, isDuet: false },
    { words: [
      { word: "女", startTime: 1000, endTime: 1100 },
      { word: ":", startTime: 1100, endTime: 1200 },
      { word: "你", startTime: 1200, endTime: 1500, romanWord: "ni" },
      { word: "好", startTime: 1500, endTime: 1800, romanWord: "hao" },
    ], startTime: 1000, endTime: 1800, translatedLyric: "hello", romanLyric: "ni hao", isBG: true, isDuet: true },
  ];
  const original = structuredClone(result.ttml);
  stripVocalLabels(result);
  expect(result.ttml).toHaveLength(1);
  expect(result.ttml?.[0]).toMatchObject({ startTime: 1000, endTime: 1800, translatedLyric: "hello", romanLyric: "ni hao", isBG: true, isDuet: true });
  expect(result.ttml?.[0].words).toEqual([
    { word: "你", startTime: 1000, endTime: 1500, romanWord: "ni" },
    { word: "好", startTime: 1500, endTime: 1800, romanWord: "hao" },
  ]);
  expect(original[1].words[0].word).toBe("女");
});


it("器乐团队不作为男女合标签删除或合并时间", () => {
  const words = [{ word: "器乐团队：乐团", startTime: 1000, endTime: 3000 }];
  expect(stripVocalWords(words)).toEqual(words);
});

it.each(["戏曲吟唱：", "戏曲吟唱:", "(戏曲吟唱：)", "（戏曲吟唱:）"])("删除独立演唱标签 %s", async (label) => {
  const result = await parseLyric({ lrc: `[00:01.00] ${label} \n[00:03.00]正文` }, null, { removeInfo: true, removeAMInfo: true });
  expect(result?.lrc.map((line) => line.content)).toEqual(["正文"]);
  expect(result?.lrcAM?.map((line) => line.words.map((word) => word.word).join(""))).toEqual(["正文"]);
});

it.each(["戏曲吟唱：正文", "(戏曲吟唱：正文)", "（戏曲吟唱:正文）"])("保留演唱标签后的正文并合并首字时间：%s", (text) => {
  const words = [...text].map((word, index) => ({ word, startTime: index * 100, endTime: (index + 1) * 100 }));
  const result = stripVocalWords(words);
  expect(result.map((word) => word.word).join("")).toBe("正文");
  expect(result[0].startTime).toBe(0);
  expect(result[1].endTime).toBe(text.length * 100);
});

it("跨行括号的真实唱词保持原样", () => {
  for (const text of ["(日出江花春雷荡", "星月潮涌并肩同往)", "戏曲吟唱的旋律", "引用我的话"]) {
    const words = [{ word: text, startTime: 0, endTime: 1000 }];
    expect(stripVocalWords(words)).toEqual(words);
  }
});
