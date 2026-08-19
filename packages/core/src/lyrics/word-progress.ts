/**
 * 逐字歌词播放进度计算。提取自旧 src/utils/Player.js updateHookData(1249-1280 行)
 * 中的逐字 percent 算法,逻辑逐行等价,仅将隐式全局(currentTime/lyricsHookOffset)
 * 改为显式参数。
 */
import type { YrcLine } from "../types/song";

/** 单字进度 */
export interface WordProgress {
  content: string;
  /** 0-1,保留 6 位小数(Number(percent.toFixed(6))) */
  percent: number;
}

/**
 * 计算当前逐字歌词行中每个字的播放进度
 * @param line 当前逐字歌词行(可能不存在)
 * @param currentTime 当前播放时间(秒)
 * @param hookOffset 歌词偏移(对应旧 lyricsHookOffset,秒)
 * @returns 每个字的内容与进度;行不存在或 content 非数组时返回 []
 */
export const computeWordProgress = (
  line: YrcLine | undefined,
  currentTime: number,
  hookOffset: number,
): WordProgress[] => {
  const lyricData: WordProgress[] = [];

  if (Array.isArray(line?.content)) {
    for (let i = 0; i < line.content.length; i++) {
      const item = line.content[i];
      const start = item.time;
      const end = item.time + item.duration;

      let percent = 0;
      const offsetCurrentTime = currentTime + hookOffset;

      if (offsetCurrentTime >= end) {
        percent = 1; // 已播放完成
      } else if (offsetCurrentTime >= start && offsetCurrentTime < end) {
        percent = (offsetCurrentTime - start) / item.duration; // 当前播放字
      } else {
        percent = 0; // 尚未播放
      }

      lyricData.push({
        content: item.content,
        percent: Number(percent.toFixed(6)),
      });
    }
  }

  return lyricData;
};
