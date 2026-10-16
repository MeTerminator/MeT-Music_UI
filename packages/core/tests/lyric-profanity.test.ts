import { describe, expect, it } from "vitest";
import { applyProfanityUncensor, originalLyric, replaceMaskedProfanity } from "../src/lyrics/profanity";
import { emptyLyric } from "../src/types/song";
import { parseLyric } from "../src/lyrics/parse";

describe("masked profanity", () => {
  it.each([
    ["f**k sh*t f*ck s**t", "fuck shit fuck shit"],
    ["sh*ts sh*tting sh*tted", "shits shitting shitted"],
    ["b*tches b***hing b*tched", "bitches bitching bitched"],
    ["f**ks f**king f**ked f**ker f**kers", "fucks fucking fucked fucker fuckers"],
    ["d**n d*mn d**ns d**ned d**ning", "damn damn damns damned damning"],
    ["ecst*cy ecst*sy", "ecstacy ecstasy"],
    ["F**K F**k f**K", "FUCK Fuck fucK"],
    ["(sh*t), f**k!", "(shit), fuck!"],
    ["ecsta*y", "ecsta*y"],
    ["f * ck f***ing ****er co** f*k f***k", "f * ck f***ing ****er co** f*k f***k"],
    ["abcf**kxyz 中文f**k éf**k f**k1 _f**k *f**k f**k*", "abcf**kxyz 中文f**k éf**k f**k1 _f**k *f**k f**k*"],
    ["down dawn damn shit", "down dawn damn shit"],
    ["", ""],
  ])("%s → %s", (input, expected) => {
    expect(replaceMaskedProfanity(input)).toBe(expected);
    // 重复调用不受正则 lastIndex 影响。
    expect(replaceMaskedProfanity(input)).toBe(expected);
  });

  it("restores every lyric representation across fragments without changing source or timing", async () => {
    const source = (await parseLyric({
      lrc: "[00:01.00]f**k",
      lrctrans: "[00:01.00]sh*t",
      qrc: "[offset:0]\n[1000,800]f(1000,200)*(1200,200)*(1400,200)k(1600,200)",
      qrcroma: "[00:01.00]d**n",
    }, null, { removeInfo: false, removeAMInfo: false }))!;
    source.ttml = [{
      words: [
        { word: "f*", startTime: 1000, endTime: 1200, romanWord: "sh" },
        { word: "*k", startTime: 1200, endTime: 1600, romanWord: "*t" },
      ],
      startTime: 1000, endTime: 1600,
      translatedLyric: "b*tches", romanLyric: "ecst*cy", isBG: false, isDuet: false,
    }];
    const before = structuredClone(source);
    const restored = applyProfanityUncensor(source, true);
    expect(restored.lrc[0].content).toBe("fuck");
    expect(restored.lrc[0].tran).toBe("shit");
    expect(restored.yrc[0].content.map((word) => word.content).join("")).toBe("fuck");
    expect(restored.lrcAM![0].words.map((word) => word.word).join("")).toBe("fuck");
    expect(restored.yrcAM![0].words.map((word) => word.word).join("")).toBe("fuck");
    expect(restored.ttml![0]).toEqual({
      ...before.ttml![0], translatedLyric: "bitches", romanLyric: "ecstacy",
      words: [
        { ...before.ttml![0].words[0], word: "fu", romanWord: "sh" },
        { ...before.ttml![0].words[1], word: "ck", romanWord: "it" },
      ],
    });
    expect(restored.yrc[0].content.map(({ content: _, ...timing }) => timing))
      .toEqual(before.yrc[0].content.map(({ content: _, ...timing }) => timing));
    expect(source).toEqual(before);
    expect(originalLyric(restored)).toBe(source);
    expect(applyProfanityUncensor(restored, false)).toBe(source);
    expect(applyProfanityUncensor(restored, true)).toBe(restored);
    expect(applyProfanityUncensor(source, false)).toBe(source);
  });

  it("does not combine separate words or lines", () => {
    const source = emptyLyric();
    source.lrc = [{ time: 0, content: "f*" }, { time: 1, content: "*k" }];
    source.yrc = [{ time: 0, endTime: 1, content: [
      { time: 0, duration: 0.5, content: "f* ", endsWithSpace: true },
      { time: 0.5, duration: 0.5, content: "*k", endsWithSpace: false },
    ] }];
    const restored = applyProfanityUncensor(source, true);
    expect(restored.lrc).toEqual(source.lrc);
    expect(restored.yrc).toEqual(source.yrc);
  });
});
