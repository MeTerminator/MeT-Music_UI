import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { api, formatNumber } from "@met/core";
import formatData from "@/lib/formatData";
import { useSettingsStore } from "@/stores/settings";

/** MV 卡片数据(formatData mv 分支;coverSize 为字符串) */
interface MvCard {
  id?: number | string;
  name?: string;
  artists?: { name?: string }[] | string;
  cover?: string;
  coverSize?: string;
  playCount?: number;
}

/** MV 歌手展示文本 */
const mvArtistsText = (artists: MvCard["artists"]): string => {
  if (!artists) return "";
  if (typeof artists === "string") return artists;
  return artists.map((a) => a?.name).filter(Boolean).join(" / ");
};

/** 歌手 - 视频(卡片栅格 + 分页,对照旧 views/Artist/videos.vue) */
export default function Videos() {
  const search = useSearch({ strict: false }) as { id?: number | string };
  const id = search.id;
  const loadSize = useSettingsStore((s) => s.loadSize);
  const pageSize = loadSize > 0 ? loadSize : 50;
  const [page, setPage] = useState(1);

  // 视频总数取自歌手详情(与旧实现的 mvSize prop 一致;query key 与布局层共享缓存)
  const detailQuery = useQuery({
    queryKey: ["artist", "detail", id],
    queryFn: () => api.getArtistDetail(id as number | string),
    enabled: id != null && id !== "",
  });

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["artist", "videos", id, page, pageSize],
    queryFn: () => api.getArtistVideos(id as number | string, pageSize, (page - 1) * pageSize),
    enabled: id != null && id !== "",
    placeholderData: keepPreviousData,
  });

  // 原始接口字段访问豁免点
  const raw = data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const detailRaw = (detailQuery.data as any)?.data; // eslint-disable-line @typescript-eslint/no-explicit-any
  const total: number = detailRaw?.artist?.mvSize ?? detailRaw?.videoCount ?? 0;
  const videos = useMemo<MvCard[]>(
    () => (formatData(raw?.mvs, "mv") ?? []) as unknown as MvCard[],
    [raw],
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (isError) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">
        获取歌手视频失败,请稍后重试
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-video w-full rounded-xl bg-[var(--met-bg-elevated)]" />
            <div className="mt-2 h-3 w-3/4 rounded bg-[var(--met-bg-elevated)]" />
          </div>
        ))}
      </div>
    );
  }

  if (!videos.length) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">当前歌手暂无视频</div>
    );
  }

  return (
    <div className="flex flex-col pt-4">
      {/* MV 栅格 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {videos.map((video, index) => (
          <button
            key={`${video.id}-${index}`}
            type="button"
            onClick={() => toast("视频播放 U3 后续")}
            className="group flex flex-col text-left"
          >
            <div className="relative w-full overflow-hidden rounded-xl">
              <img
                src={video.coverSize || video.cover}
                alt=""
                loading="lazy"
                className="aspect-video w-full bg-[var(--met-bg-elevated)] object-cover transition-transform group-hover:scale-[1.02]"
              />
              {video.playCount ? (
                <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                  {formatNumber(video.playCount)} 次播放
                </span>
              ) : null}
            </div>
            <span
              className="mt-2 truncate text-sm text-[var(--met-fg)] transition-colors group-hover:text-[var(--met-primary)]"
              title={video.name}
            >
              {video.name || "未知视频"}
            </span>
            {mvArtistsText(video.artists) ? (
              <span className="mt-0.5 truncate text-xs text-[var(--met-fg-dim)]">
                {mvArtistsText(video.artists)}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {/* 分页 */}
      {total > pageSize ? (
        <div className="flex items-center justify-center gap-3 py-6">
          <button
            type="button"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-full border border-[var(--met-border)] px-4 py-1.5 text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            上一页
          </button>
          <span className="min-w-16 text-center text-xs text-[var(--met-fg-dim)]">
            {page} / {totalPages} 页
          </span>
          <button
            type="button"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-full border border-[var(--met-border)] px-4 py-1.5 text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}
