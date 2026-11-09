import type { ParsedLyric, YrcLine } from "../types/song";
import { computeWordProgress } from "./word-progress";

type TtmlLine = NonNullable<ParsedLyric["ttml"]>[number];

interface TtmlTimingSettings {
  lyricsAMttmlUseOffset: boolean;
  lyricsAMOffset: number;
  lyricsShiftMs: number;
}

export const getTtmlPlaybackOffset = (settings: TtmlTimingSettings): number =>
  (settings.lyricsAMttmlUseOffset ? settings.lyricsAMOffset : 0) - settings.lyricsShiftMs;

export const getTtmlPlaybackTime = (
  seconds: number,
  settings: TtmlTimingSettings,
): number =>
  Math.max(0, Math.round(seconds * 1000 + getTtmlPlaybackOffset(settings)));

/**
 * 单行歌词只显示最近触发的 TTML 主唱/对唱行。背景人声不参与选择；
 * 重叠演唱取起始时间最晚的一行，同一时间触发时取数组中靠后的行。
 * 行结束后保留到下一行触发，seek 回退时按时间重新选择。
 */
export function findTtmlCurrentLine(
  lines: readonly TtmlLine[],
  currentTimeMs: number,
): TtmlLine | undefined {
  let selected: TtmlLine | undefined;
  for (const line of lines) {
    if (line.isBG || !line.words.length || !Number.isFinite(line.startTime)) continue;
    if (line.startTime <= currentTimeMs && (!selected || line.startTime >= selected.startTime)) {
      selected = line;
    }
  }

  return selected;
}

export const ttmlLineToYrc = (line: TtmlLine): YrcLine => ({
  time: line.startTime / 1000,
  endTime: line.endTime / 1000,
  content: line.words.map((word) => ({
    content: word.word,
    time: word.startTime / 1000,
    duration: Math.max(0, word.endTime - word.startTime) / 1000,
    endsWithSpace: false,
  })),
});

export function getTtmlCurrentLyric(lines: readonly TtmlLine[], currentTimeMs: number) {
  const selected = findTtmlCurrentLine(lines, currentTimeMs);
  return {
    lyricText: selected?.words.map((word) => word.word).join("") ?? "",
    lyricTrans: selected?.translatedLyric ?? "",
    lyricData: computeWordProgress(
      selected ? ttmlLineToYrc(selected) : undefined,
      currentTimeMs / 1000,
      0,
    ),
  };
}
