import type { ParsedLyric } from "../types/song";

type TimedWord = { word: string; startTime: number; endTime: number };
const LABEL = /(?:[（(]\s*)?戏曲吟唱[：:]|[男女合][：:]/g;
const hasLabel = (text: string): boolean => new RegExp(LABEL.source).test(text);
const labelRanges = (text: string): { index: number; length: number }[] => {
  const matches = [...text.matchAll(LABEL)];
  const ranges = matches.map((match) => ({ index: match.index, length: match[0].length }));
  // 只去掉包住「戏曲吟唱：正文」的成对括号，其他歌词的括号保持原样。
  if (matches.some((match) => /^[（(]/.test(match[0]))) {
    const closing = /[）)]\s*$/.exec(text);
    if (closing) ranges.push({ index: closing.index, length: 1 });
  }
  return ranges;
};
const stripText = (text: string): string => stripVocalWords([{ word: text, startTime: 0, endTime: 0 }])[0]?.word ?? "";

/** 在完整歌词行配对之后处理标签，避免删行影响翻译或音译的下标。 */
export const stripVocalWords = <T extends TimedWord>(words: T[]): T[] => {
  const text = words.map((word) => word.word).join("");
  const matches = labelRanges(text);
  if (!matches.length) return words;
  const keep = Array.from({ length: text.length }, () => true);
  for (const match of matches) {
    for (let i = match.index; i < match.index + match.length; i++) keep[i] = false;
  }
  const visible = text.split("").map((char, index) => keep[index] ? char : "").join("");
  if (!visible.trim()) return [];
  // 只清理命中标签的行的首尾空白，正文内部空格保持原样。
  let left = 0;
  let right = text.length - 1;
  while (left <= right && (!keep[left] || /\s/.test(text[left]))) keep[left++] = false;
  while (right >= left && (!keep[right] || /\s/.test(text[right]))) keep[right--] = false;

  let offset = 0;
  let removedDuration = 0;
  const remaining: { word: T; removedBefore: number }[] = [];
  for (const source of words) {
    const content = source.word.split("").filter((_, index) => keep[offset + index]).join("");
    offset += source.word.length;
    if (content) remaining.push({ word: { ...source, word: content }, removedBefore: removedDuration });
    else removedDuration += Math.max(0, source.endTime - source.startTime);
  }
  // 将被删除词的时长移到第一个正文词，移动中间词以保持时间轴连续、有序。
  return remaining.map(({ word, removedBefore }, index) => {
    const shift = removedDuration - removedBefore;
    return {
      ...word,
      startTime: index === 0 ? words[0].startTime : word.startTime + shift,
      endTime: word.endTime + shift,
    };
  });
};

export const stripVocalLabels = (result: ParsedLyric): ParsedLyric => {
  const amLines = [...(result.lrcAM ?? []), ...(result.yrcAM ?? []), ...(result.ttml ?? [])];
  if (!result.lrc.some((line) => hasLabel(line.content)) &&
      !result.yrc.some((line) => hasLabel(line.content.map((word) => word.content).join(""))) &&
      !amLines.some((line) => hasLabel(line.words.map((word) => word.word).join("")))) return result;
  result.lrc = result.lrc.flatMap((line) => {
    if (!hasLabel(line.content)) return [line];
    const content = stripText(line.content);
    return content ? [{ ...line, content }] : [];
  });
  result.yrc = result.yrc.flatMap((line) => {
    if (!hasLabel(line.content.map((word) => word.content).join(""))) return [line];
    const words = stripVocalWords(line.content.map((word) => ({
      ...word, word: word.content, startTime: word.time, endTime: word.time + word.duration,
    })));
    return words.length ? [{ ...line, content: words.map(({ word, startTime, endTime, ...original }) => ({
      ...original, content: word, time: startTime, duration: Number((endTime - startTime).toFixed(6)), endsWithSpace: word.endsWith(" "),
    })) }] : [];
  });
  const cleanLines = <T extends { words: TimedWord[] }>(lines: T[]): T[] => lines.flatMap((line) => {
    const words = stripVocalWords(line.words);
    return words.length ? [{ ...line, words }] : [];
  });
  if (result.lrcAM) result.lrcAM = cleanLines(result.lrcAM);
  if (result.yrcAM) result.yrcAM = cleanLines(result.yrcAM);
  if (result.ttml) result.ttml = cleanLines(result.ttml);
  result.hasYrc = result.yrc.length > 0;
  result.hasLrcTran = result.lrc.some((line) => Boolean(line.tran));
  result.hasLrcRoma = result.lrc.some((line) => Boolean(line.roma));
  result.hasYrcTran = result.yrc.some((line) => Boolean(line.tran));
  result.hasYrcRoma = result.yrc.some((line) => Boolean(line.roma));
  return result;
};
