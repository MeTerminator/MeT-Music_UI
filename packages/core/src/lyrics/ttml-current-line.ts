import type { ParsedLyric } from "../types/song";
import { computeWordProgress } from "./word-progress";

/**
 * 桌面端只显示最近触发的 TTML 主唱/对唱行。背景人声不参与选择；
 * 重叠演唱取起始时间最晚的一行，同一时间触发时取数组中靠后的行。
 * 行结束后保留到下一行触发，seek 回退时按时间重新选择。
 */
export function getTtmlCurrentLyric(
  lines: NonNullable<ParsedLyric["ttml"]>,
  currentTimeMs: number,
) {
  let selected: (typeof lines)[number] | undefined;
  for (const line of lines) {
    if (line.isBG || !line.words.length || !Number.isFinite(line.startTime)) continue;
    if (line.startTime <= currentTimeMs && (!selected || line.startTime >= selected.startTime)) {
      selected = line;
    }
  }

  return {
    lyricText: selected?.words.map((word) => word.word).join("") ?? "",
    lyricTrans: selected?.translatedLyric ?? "",
    lyricData: computeWordProgress(selected ? {
      time: selected.startTime / 1000,
      endTime: selected.endTime / 1000,
      content: selected.words.map((word) => ({
        content: word.word,
        time: word.startTime / 1000,
        duration: Math.max(0, word.endTime - word.startTime) / 1000,
        endsWithSpace: false,
      })),
    } : undefined, currentTimeMs / 1000, 0),
  };
}
