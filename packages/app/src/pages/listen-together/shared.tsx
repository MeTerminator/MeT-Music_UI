import type { SyntheticEvent } from "react";
import type { Song } from "@met/core";
import { getAssetUrl } from "@/platform/web";
import { copyText as copy } from "@/lib/clipboard";
import { formatArtists, getCoverUrl } from "@/lib/format";

/**
 * 一起听歌页面共享工具(对应旧 src/views/ListenTogether.vue 中的格式化函数
 * 与 utils/helper.copyData;格式化/复制已收敛到 @/lib/format 与 @/lib/clipboard)。
 */

/** 歌手字段兼容显示(旧 formatArtist,空值兜底「未知歌手」) */
export const formatArtist = (artists: Song["artists"]): string =>
  formatArtists(artists) || "未知歌手";

/** 歌曲封面缩略地址 */
export const songCover = (song: Song): string =>
  getCoverUrl(song, "s") ?? getAssetUrl("/images/pic/song.jpg");

/** 剩余时间格式化 mm:ss */
export const formatRemaining = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/** 日志时间格式化 HH:mm:ss(旧 formatLogTime) */
export const formatLogTime = (ts: number | undefined): string => {
  const date = new Date(ts ?? Date.now());
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  const s = date.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
};

/** 复制文本并提示(旧 helper.copyData;实现收敛至 @/lib/clipboard) */
export const copyText = (data: string, label: string): Promise<void> =>
  copy(data, `${label}成功`);

/** 图片加载失败时回退到默认图(避免回退图也失败导致死循环) */
export const fallbackImg =
  (fallbackPath: string) =>
  (e: SyntheticEvent<HTMLImageElement>): void => {
    const img = e.currentTarget;
    if (img.dataset.fallback === "1") return;
    img.dataset.fallback = "1";
    img.src = getAssetUrl(fallbackPath);
  };

/** 房间日志条目(协议层为 unknown[],此处按旧页展示字段收窄) */
export interface RoomLogEntry {
  timestamp?: number;
  user?: string;
  action?: string;
}
