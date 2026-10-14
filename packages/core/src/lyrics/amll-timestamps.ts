interface TimestampRange {
  startTime: number;
  endTime: number;
}
interface TimestampWord extends TimestampRange {
  ruby?: TimestampRange[];
}
interface TimestampLine extends TimestampRange {
  words: TimestampWord[];
}

function normalizeRange<T extends TimestampRange>(range: T, fallbackStart = 0, fallbackEnd = fallbackStart): T {
  const startTime = Math.max(0, Number.isFinite(range.startTime) ? range.startTime : fallbackStart);
  const endTime = Math.max(startTime, Number.isFinite(range.endTime) ? range.endTime : fallbackEnd);
  return { ...range, startTime, endTime };
}

/**
 * AMLL 0.6 会在优化歌词前校验全部时间范围。
 * 在渲染边界校正源数据与切行偏移，不修改原始歌词和逐字演唱时长。
 */
export function prepareAmllLines<T extends TimestampLine>(lines: readonly T[], endTimeOffset = 0): T[] {
  const offset = Number.isFinite(endTimeOffset) ? endTimeOffset : 0;
  return lines.map((line) => {
    const fallbackStart = Number.isFinite(line.startTime) ? Math.max(0, line.startTime) : 0;
    const words = line.words.map((word) => {
      const normalized = normalizeRange(word, fallbackStart);
      return word.ruby ? {
        ...normalized,
        ruby: word.ruby.map((ruby) => normalizeRange(ruby, normalized.startTime, normalized.endTime)),
      } : normalized;
    });
    const normalized = normalizeRange(line, words[0]?.startTime ?? 0,
      words.reduce((end, word) => Math.max(end, word.endTime), fallbackStart));
    return {
      ...normalized,
      words,
      endTime: Math.max(normalized.startTime, normalized.endTime - offset),
    };
  });
}
