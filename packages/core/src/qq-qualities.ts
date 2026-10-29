import { qqQualities } from "./qq-qualities.generated";
export { qqQualities };
export type QQCodec = "aac" | "mp3" | "flac" | "ogg" | "nac";

/** Keep proprietary spatial streams out of browser playback, regardless of suffix. */
export const qqPlaybackQualities = (codecs: readonly string[]) =>
  qqQualities.filter((q) => q.codec !== null && codecs.includes(q.codec));

export const normalizeQQPlaybackLevel = (level: string): string => {
  const quality = qqQualities.find((q) => q.key === level.toUpperCase());
  return quality?.codec ? quality.key.toLowerCase() : "hq";
};

export const qqDownloadOptions = (available?: readonly string[] | null) =>
  qqQualities
    .filter((q) => available == null || available.includes(q.key))
    .map((q) => ({ value: q.key, label: q.label }));
