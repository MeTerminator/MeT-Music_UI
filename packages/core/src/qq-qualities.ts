import { qqQualities } from "./qq-qualities.generated";
export { qqQualities };
export type SpatialCodec = "mpegh" | "av3a" | "vorbis" | "dtsx" | "flac";

export type NativeDolbyCodec = "ac4" | "eac3";
export type QQCodec = "aac" | "mp3" | "flac" | "ogg" | "nac" | NativeDolbyCodec;

export const qqDolbyCodec = (level?: string | null): NativeDolbyCodec | undefined => {
  switch (level?.toUpperCase()) {
    case "DA": return "ac4";
    case "DAEAC3": return "eac3";
  }
};

export const qqDolbyLevels = (level: string, codecs: readonly string[]): string[] => {
  switch (qqDolbyCodec(level)) {
    case "ac4":
      return [...(codecs.includes("ac4") ? ["DA"] : []), ...(codecs.includes("eac3") ? ["DAEAC3"] : [])];
    case "eac3":
      return codecs.includes("eac3") ? ["DAEAC3"] : [];
    default:
      return [];
  }
};

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
    if (qqDolbyCodec(q.key)) return qqDolbyLevels(q.key, codecs).length > 0;
    const codec = qqSpatialCodec(q.key);
    return codec ? spatial.includes(codec) : q.codec !== null && codecs.includes(q.codec);
  });

export const normalizeQQPlaybackLevel = (level: string, codecs: readonly string[] = []): string => {
  const quality = qqQualities.find((q) => q.key === level.toUpperCase());
  return quality && (quality.codec || qqSpatialCodec(quality.key) || qqDolbyLevels(quality.key, codecs).length)
    ? quality.key.toLowerCase()
    : "hq";
};

export const qqDownloadOptions = (available?: readonly string[] | null) =>
  qqQualities
    .filter((q) => available == null || available.includes(q.key))
    .map((q) => ({ value: q.key, label: q.label }));
