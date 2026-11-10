import { qqQualities } from "./qq-qualities.generated";
export { qqQualities };
export type SpatialCodec = "mpegh" | "av3a" | "vorbis" | "dtsx";

export type QQCodec = "aac" | "mp3" | "flac" | "ogg" | "nac";

export const qqSpatialCodec = (level?: string | null): SpatialCodec | undefined => {
  switch (level?.toUpperCase()) {
    case "DTSX":
      return "dtsx";
    case "RA360":
      return "mpegh";
    case "Q360V3":
    case "Q360V4":
      return "vorbis";
  }
};

export const qqPlaybackQualities = (
  codecs: readonly string[],
  spatial: readonly SpatialCodec[] = [],
) =>
  qqQualities.filter((q) => {
    const codec = qqSpatialCodec(q.key);
    return codec ? spatial.includes(codec) : q.codec !== null && codecs.includes(q.codec);
  });

export const normalizeQQPlaybackLevel = (level: string): string => {
  const quality = qqQualities.find((q) => q.key === level.toUpperCase());
  return quality && (quality.codec || qqSpatialCodec(quality.key))
    ? quality.key.toLowerCase()
    : "hq";
};

export const qqDownloadOptions = (available?: readonly string[] | null) =>
  qqQualities
    .filter((q) => available == null || available.includes(q.key))
    .map((q) => ({ value: q.key, label: q.label }));
