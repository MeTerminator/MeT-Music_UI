import type { ParsedLyric } from "../types/song";

const RULES: readonly [string, readonly string[]][] = [
  ["fuck", ["", "s", "ing", "ed", "er", "ers"]],
  ["shit", ["", "s", "ting", "ted"]],
  ["bitch", ["", "es", "ing", "ed"]],
  ["cunt", ["", "s"]],
  ["cock", ["", "s"]],
  ["dick", ["", "s"]],
  ["damn", ["", "s", "ed", "ing"]],
  ["asshole", ["", "s"]],
  ["whore", ["", "s"]],
  ["sucker", ["", "s"]],
  ["nigga", ["", "s"]],
  ["ecstacy", [""]],
  ["ecstasy", [""]],
];

// 只允许词根内部按字母数屏蔽，词根首尾和后缀必须可见。
const entries = RULES.flatMap(([root, suffixes]) => {
  const pattern = [...root].map((char, index) =>
    index === 0 || index === root.length - 1 ? char : `[${char}*]`,
  ).join("");
  return suffixes.map((suffix) => ({
    word: root + suffix,
    pattern: pattern + suffix,
    exact: new RegExp(`^(?:${pattern}${suffix})$`, "i"),
  }));
});
const MASKED_WORD = new RegExp(
  `(?<![\\p{L}\\p{M}\\p{N}_*])(?:${entries.map((entry) => entry.pattern).join("|")})(?![\\p{L}\\p{M}\\p{N}_*])`,
  "giu",
);

export const replaceMaskedProfanity = (text: string): string => {
  if (!text.includes("*")) return text;
  return text.replace(MASKED_WORD, (masked: string) => {
    const candidates = new Set(entries.filter((entry) => entry.exact.test(masked)).map((entry) => entry.word));
    if (candidates.size !== 1) return masked;
    const restored = [...candidates][0];
    const visible = masked.replace(/\*/g, "");
    if (visible === visible.toUpperCase()) return restored.toUpperCase();
    if (masked[0] === masked[0].toUpperCase() && visible.slice(1) === visible.slice(1).toLowerCase()) {
      return restored[0].toUpperCase() + restored.slice(1);
    }
    return masked.split("").map((char, index) => char === "*" ? restored[index] : char).join("");
  });
};

// 按整行匹配，再按原字符位置分回片段。替换等长，因此不改变逐字时间轴。
const restoreFragments = (texts: string[]): string[] => {
  const restored = replaceMaskedProfanity(texts.join(""));
  let offset = 0;
  return texts.map((text) => {
    const fragment = restored.slice(offset, offset + text.length);
    offset += text.length;
    return fragment;
  });
};
const restoreOptional = (text: string | undefined): string | undefined =>
  text === undefined ? undefined : replaceMaskedProfanity(text);

// 只记录派生结果到原始数据的映射，关闭开关和持久化时都能恢复原文。
const originals = new WeakMap<ParsedLyric, ParsedLyric>();
export const originalLyric = (data: ParsedLyric): ParsedLyric => originals.get(data) ?? data;

export const applyProfanityUncensor = (data: ParsedLyric, enabled: boolean): ParsedLyric => {
  if (!enabled) return originalLyric(data);
  if (originals.has(data)) return data;
  const restoreAM = <T extends { words: { word: string; romanWord?: string }[]; translatedLyric?: string; romanLyric?: string }>(lines: T[]): T[] =>
    lines.map((line) => {
      const words = restoreFragments(line.words.map((word) => word.word));
      const romanWords = restoreFragments(line.words.map((word) => word.romanWord ?? ""));
      return {
        ...line,
        translatedLyric: restoreOptional(line.translatedLyric),
        romanLyric: restoreOptional(line.romanLyric),
        words: line.words.map((word, index) => ({
          ...word, word: words[index],
          ...(word.romanWord === undefined ? {} : { romanWord: romanWords[index] }),
        })),
      };
    });
  const result: ParsedLyric = {
    ...data,
    lrc: data.lrc.map((line) => ({ ...line, content: replaceMaskedProfanity(line.content), tran: restoreOptional(line.tran), roma: restoreOptional(line.roma) })),
    yrc: data.yrc.map((line) => {
      const words = restoreFragments(line.content.map((word) => word.content));
      return {
        ...line, tran: restoreOptional(line.tran), roma: restoreOptional(line.roma),
        content: line.content.map((word, index) => ({ ...word, content: words[index] })),
      };
    }),
    ...(data.lrcAM ? { lrcAM: restoreAM(data.lrcAM) } : {}),
    ...(data.yrcAM ? { yrcAM: restoreAM(data.yrcAM) } : {}),
    ...(data.ttml ? { ttml: restoreAM(data.ttml) } : {}),
  };
  originals.set(result, data);
  return result;
};
