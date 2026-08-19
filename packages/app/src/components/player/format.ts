import type { Song } from "@met/core";

/** 歌手展示文本:artists 为数组时 join " / ",为字符串时原样返回 */
export const formatArtists = (artists: Song["artists"]): string => {
  if (!artists) return "";
  if (typeof artists === "string") return artists;
  return artists.map((artist) => artist?.name ?? "").filter(Boolean).join(" / ");
};

/** 封面地址(缩略图 s / 大图 l),无则返回 undefined */
export const getCoverUrl = (song: Song, size: "s" | "l"): string | undefined =>
  song.coverSize?.[size] || song.cover || undefined;
