/**
 * @met/core 公共入口。
 * 框架无关:禁止引入 React/Vue/Pinia;DOM 访问仅限注入接口(见 player/deps.ts)。
 */
export * from "./types/song";
export * from "./types/notify";

export * from "./lib/time";
export * from "./lib/format";

export * from "./lyrics/parse";
export * from "./lyrics/profanity";
export * from "./lyrics/amll-timestamps";
export * from "./lyrics/word-progress";
export * from "./lyrics/ttml-current-line";

export * as api from "./api/index";
export {
  configureLyricCache,
  normalizeLyricCacheDays,
  DEFAULT_LYRIC_CACHE_DAYS,
} from "./api/lyric-cache";

export * from "./listen-together/types";
export * from "./listen-together/sync";
export * from "./listen-together/client";

export * from "./player/deps";
export * from "./player/engine";

export type {
  QmcTrackInfo,
  QmcInfoSection,
  QmcArtist,
  QmcComment,
} from "./api/contracts";

export * from "./types/platform";

export * from "./qq-qualities";
