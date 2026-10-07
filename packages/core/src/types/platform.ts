import type { Song } from "./song";
export type Platform = "qq" | "netease";
export const songPlatform = (song?: Pick<Song, "source">): Platform => song?.source === "netease" ? "netease" : "qq";
export const platformName = (platform: Platform): string => platform === "netease" ? "网易云音乐" : "QQ 音乐";

export const NETEASE_LEVELS = ["standard", "higher", "exhigh", "lossless", "hires", "jyeffect", "dolby", "vivid", "jymaster", "sky"] as const;
export const playbackLevel = (settings: { songLevel: string; neteaseSongLevel?: string }, platform: Platform): string =>
  platform === "netease" ? settings.neteaseSongLevel ?? "exhigh" : settings.songLevel;
