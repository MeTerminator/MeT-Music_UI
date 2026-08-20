import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api, formatNumber, getSongTime, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import { formatArtists } from "@/lib/format";
import { Pagination } from "@/components/ui/pagination";
import { useSettingsStore } from "@/stores/settings";

/** 时长展示(mv 分支 duration 为毫秒数) */
const durationText = (duration: Song["duration"]): string => {
  if (typeof duration === "number" && duration > 0) return getSongTime(duration);
  return typeof duration === "string" ? duration : "";
};

/** 搜索结果 - 视频(对照旧 src/views/Search/videos.vue,type=1004,消费 result.mvs/mvCount) */
export default function Videos() {
  const search = useSearch({ strict: false }) as { keywords?: string };
  const keywords = search.keywords ?? "";
  const navigate = useNavigate();
  const searchLoadSize = useSettingsStore((s) => s.searchLoadSize) || 30;

  const [page, setPage] = useState(1);
  // 关键词变化时回到第一页
  useEffect(() => {
    setPage(1);
  }, [keywords]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["search", "videos", keywords, page, searchLoadSize],
    queryFn: () =>
      api.getSearchRes(keywords, searchLoadSize, (page - 1) * searchLoadSize, 1004),
    enabled: !!keywords,
  });

  const totalCount: number = data?.result?.mvCount ?? 0;
  const videos = useMemo<Song[]>(
    () => formatData(data?.result?.mvs, "mv") ?? [],
    [data],
  );

  if (!keywords) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">
        请输入关键词后再搜索
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">
        搜索出错了,请稍后重试
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-video rounded-lg bg-[var(--met-bg-elevated)]" />
            <div className="mt-2 h-3 w-3/4 rounded bg-[var(--met-bg-elevated)]" />
          </div>
        ))}
      </div>
    );
  }

  if (!videos.length) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">
        很抱歉,未能找到与 {keywords} 相关的任何视频
      </div>
    );
  }

  return (
    <div>
      {/* 视频横卡 */}
      <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((video) => {
          const artistLine = formatArtists(video.artists);
          const duration = durationText(video.duration);
          return (
            <button
              key={String(video.id)}
              type="button"
              onClick={() =>
                video.id != null &&
                navigate({ to: "/videos-player", search: { id: String(video.id) } })
              }
              className="group flex flex-col text-left"
            >
              <div className="relative aspect-video overflow-hidden rounded-lg bg-[var(--met-bg-elevated)]">
                {video.cover ? (
                  <img
                    src={video.cover}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : null}
                {duration ? (
                  <span className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs tabular-nums text-white">
                    {duration}
                  </span>
                ) : null}
                {typeof video.playCount === "number" ? (
                  <span className="absolute top-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                    {formatNumber(video.playCount)} 次播放
                  </span>
                ) : null}
              </div>
              <span
                className="mt-2 line-clamp-2 text-sm text-[var(--met-fg)] group-hover:text-[var(--met-primary)]"
                title={video.name}
              >
                {video.name}
              </span>
              {artistLine ? (
                <span className="mt-0.5 line-clamp-1 text-xs text-[var(--met-fg-dim)]">
                  {artistLine}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* 分页 */}
      <Pagination
        page={page}
        pageCount={Math.ceil(totalCount / searchLoadSize)}
        onChange={setPage}
      />
    </div>
  );
}
