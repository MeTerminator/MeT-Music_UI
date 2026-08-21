import type { Song } from "@met/core";

/**
 * 展示层通用格式化(收敛自 components/player/format.ts 及
 * Home / search Albums / search Videos / SongList / listen-together shared
 * 的各自实现;原 components/player/format.ts 保留 re-export 兼容)。
 */

/**
 * 歌手展示文本:数组时按 name(兼容 title / userName 字段)join " / ",
 * 字符串原样返回,空值返回 ""(需要「未知歌手」兜底时由调用方 `|| "未知歌手"`)。
 */
export const formatArtists = (artists: Song["artists"]): string => {
  if (!artists) return "";
  if (typeof artists === "string") return artists;
  return artists
    .map((artist) => {
      const raw = artist as Record<string, unknown>;
      return (
        artist?.name ??
        (raw?.title as string | undefined) ??
        (raw?.userName as string | undefined) ??
        ""
      );
    })
    .filter(Boolean)
    .join(" / ");
};

/** 封面地址(coverSize 指定尺寸 → cover → 本地封面),无则返回 undefined */
export const getCoverUrl = (
  song: Song,
  size: "s" | "m" | "l" = "s",
): string | undefined =>
  song.coverSize?.[size] || song.cover || song.localCover || undefined;
