import type { LyricLine, TTMLLyric } from "@applemusic-like-lyrics/lyric";
import type { LyricApiData, TtmlLyricData } from "../lyrics/parse";

/**
 * 领域类型。字段与现有后端返回及 localStorage 持久化结构保持一致
 * (见旧 src/utils/formatData.js 与各 store),迁移期间不做字段更名。
 */

/** 封面多尺寸地址 */
export interface CoverSize {
  s?: string;
  m?: string;
  l?: string;
  xl?: string;
}

/** 歌手 */
export interface Artist {
  mid?: string;
  title?: string;
  userName?: string;
  id?: number | string;
  name: string;
}

/** 歌曲(在线或本地) */
export interface Song {
  mid?: string;
  id: number | string;
  name: string;
  source?: "qqmusic" | "netease" | "local";
  added_by?: string | null;
  added_by_uid?: string | null;
  mv?: number | string | null;
  alia?: string;
  fee?: number;
  size?: number | { music?: number; album?: number; mv?: number; fans?: number };
  ttml?: 0 | 1;
  count?: number;
  description?: string;
  alias?: string[];
  playCount?: number;
  publishTime?: string | number;
  createTime?: number;
  updateTime?: number;
  userId?: number | string;
  creator?: { nickname?: string; userId?: number | string; avatarUrl?: string } | string;
  tracks?: Song[] | null;
  tags?: string | string[] | { id: number; name: string };
  share?: number;
  desc?: string;
  rcmdText?: string;
  artists?: Artist[] | string;
  album?: { id?: number | string; name: string } | string;
  coverSize?: CoverSize;
  cover?: string;
  /** "mm:ss" 字符串(后端格式化返回)或毫秒数 */
  duration?: string | number;
  /** 本地歌曲文件路径;存在即视为本地歌曲 */
  path?: string;
  /** 本地歌曲封面 Blob URL(运行期填充) */
  localCover?: string;
  /** 云盘歌曲标记 */
  pc?: boolean;
}

/** 普通(逐行)歌词行 */
export interface LrcLine {
  /** 行起始时间(秒) */
  time: number;
  content: string;
  /** 翻译 */
  tran?: string;
  /** 音译 */
  roma?: string;
}

/** 逐字歌词中的单字/词 */
export interface YrcWord {
  /** 字起始时间(秒) */
  time: number;
  /** 字持续时长(秒) */
  duration: number;
  content: string;
  endsWithSpace: boolean;
}

/** 逐字歌词行 */
export interface YrcLine {
  /** 行起始时间(秒) */
  time: number;
  /** 行结束时间(秒) */
  endTime: number;
  content: YrcWord[];
  tran?: string;
  roma?: string;
}

/** AMLL LyricWord(与 @applemusic-like-lyrics/core 接口对齐,时间为毫秒) */
export interface AMWord {
  startTime: number;
  endTime: number;
  word: string;
  romanWord: string;
  obscene: boolean;
}

/** AMLL LyricLine(时间为毫秒) */
export interface AMLine {
  words: AMWord[];
  translatedLyric: string;
  romanLyric: string;
  startTime: number;
  endTime: number;
  isBG: boolean;
  isDuet: boolean;
}

/** 歌词解析结果(对应旧 musicData.playSongLyric 的超集) */
export interface ParsedLyric {
  hasLrcTran: boolean;
  hasLrcRoma: boolean;
  hasYrc: boolean;
  hasYrcTran: boolean;
  hasYrcRoma: boolean;
  hasTtml?: boolean;
  lrc: LrcLine[];
  yrc: YrcLine[];
  lrcAM?: AMLine[];
  yrcAM?: AMLine[];
  ttml?: LyricLine[];
  ttmlMeta?: TTMLLyric["metadata"];
  /** 原始接口响应(调试用途,与旧实现保持一致) */
  lyricResponse?: LyricApiData;
  ttmlLyricResponse?: TtmlLyricData | null;
}

/** 空歌词(加载失败/无歌词时的缺省值) */
export const emptyLyric = (): ParsedLyric => ({
  hasLrcTran: false,
  hasLrcRoma: false,
  hasYrc: false,
  hasYrcTran: false,
  hasYrcRoma: false,
  lrc: [],
  yrc: [],
});

/** Same numeric ID on different providers is a different resource. */
export const songIdentityKey = (song: Pick<Song, "id" | "source" | "path">): string =>
  JSON.stringify([song.source ?? (song.path ? "local" : "qqmusic"), String(song.id)]);
