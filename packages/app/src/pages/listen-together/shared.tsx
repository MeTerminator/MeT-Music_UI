import type { SyntheticEvent } from "react";
import { toast } from "sonner";
import type { Song } from "@met/core";
import { getAssetUrl } from "@/platform/web";

/**
 * 一起听歌页面共享工具(对应旧 src/views/ListenTogether.vue 中的格式化函数
 * 与 utils/helper.copyData)。
 */

/** 歌手字段兼容显示(旧 formatArtist) */
export const formatArtist = (artists: Song["artists"]): string => {
  if (!artists) return "未知歌手";
  if (Array.isArray(artists)) {
    return artists
      .map((a) => a.name || String((a as Record<string, unknown>).title ?? ""))
      .join(" / ");
  }
  return artists;
};

/** 歌曲封面缩略地址 */
export const songCover = (song: Song): string =>
  song.coverSize?.s ?? song.cover ?? getAssetUrl("/images/pic/song.jpg");

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

/** 复制文本并提示(旧 helper.copyData) */
export const copyText = async (data: string, label: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(data);
    toast.success(`${label}成功`);
  } catch (error) {
    console.error("复制出错：", error);
    toast.error(`${label}失败`);
  }
};

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
