import type { NativeDolbyCodec, SpatialCodec } from "../qq-qualities";
import { normalizeQQPlaybackLevel, qqDolbyCodec, qqSpatialCodec } from "../qq-qualities";
import type { Song } from "./song";
export type Platform = "qq" | "netease";
export const songPlatform = (song?: Pick<Song, "source">): Platform =>
  song?.source === "netease" ? "netease" : "qq";
export const platformName = (platform: Platform): string =>
  platform === "netease" ? "网易云音乐" : "QQ 音乐";

export const NETEASE_LEVELS = [
  "standard",
  "higher",
  "exhigh",
  "lossless",
  "hires",
  "jyeffect",
  "dolby",
  "vivid",
  "jymaster",
  "sky",
] as const;
export const playbackLevel = (
  settings: { songLevel: string; neteaseSongLevel?: string },
  platform: Platform,
  codecs?: readonly string[],
): string =>
  platform === "netease"
    ? (settings.neteaseSongLevel === "dolby" && codecs && !codecs.includes("ac4")
      ? "exhigh" : settings.neteaseSongLevel ?? "exhigh")
    : normalizeQQPlaybackLevel(settings.songLevel, codecs);

export const neteasePlaybackQualities = (
  codecs: readonly string[],
  spatial: readonly SpatialCodec[] = [],
) =>
  NETEASE_LEVELS.filter((level) => {
    switch (level) {
      case "dolby":
        return codecs.includes("ac4");
      case "vivid":
        return spatial.includes("av3a");
      case "sky":
        return spatial.includes("flac") || codecs.includes("flac");
      case "standard":
      case "higher":
      case "exhigh":
        return codecs.includes("mp3");
      default:
        return codecs.includes("flac");
    }
  });

export const dolbyPlaybackCodec = (
  platform: Platform,
  level?: string | null,
): NativeDolbyCodec | undefined =>
  platform === "qq" ? qqDolbyCodec(level) : level?.toLowerCase() === "dolby" ? "ac4" : undefined;

export const spatialPlaybackCodec = (
  platform: Platform,
  level?: string | null,
): SpatialCodec | undefined => {
  if (platform === "qq") return qqSpatialCodec(level);
  switch (level?.toLowerCase()) {
    case "vivid": return "av3a";
    case "sky": return "flac";
  }
};
