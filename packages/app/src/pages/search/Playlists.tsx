import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api, type Song } from "@met/core";
import formatData from "@/lib/formatData";

/** 搜索结果 - 歌单(点击进入歌单详情页) */
export default function Playlists() {
  const search = useSearch({ strict: false }) as { keywords?: string };
  const keywords = search.keywords ?? "";
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["search", "playlists", keywords],
    queryFn: () => api.getSearchRes(keywords, 30, 0, 1000),
    enabled: !!keywords,
  });

  // formatData 的 playlist 分支输出与 Song 同为宽松形态,此处仅用 id/name/coverSize/count
  const playlists = useMemo<Song[]>(
    () => formatData(data?.result?.playlists, "playlist", true) ?? [],
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
      <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-square rounded-lg bg-[var(--met-bg-elevated)]" />
            <div className="mt-2 h-3 w-3/4 rounded bg-[var(--met-bg-elevated)]" />
          </div>
        ))}
      </div>
    );
  }

  if (!playlists.length) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">暂无歌单</div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {playlists.map((pl) => (
        <button
          key={String(pl.id)}
          type="button"
          onClick={() => navigate({ to: "/playlist", search: { id: String(pl.id) } })}
          className="group flex flex-col text-left"
        >
          <div className="relative aspect-square overflow-hidden rounded-lg bg-[var(--met-bg-elevated)]">
            {pl.coverSize?.s ? (
              <img
                src={pl.coverSize.s}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : null}
          </div>
          <span
            className="mt-2 line-clamp-2 text-sm text-[var(--met-fg)] group-hover:text-[var(--met-primary)]"
            title={pl.name}
          >
            {pl.name}
          </span>
          {typeof pl.count === "number" ? (
            <span className="mt-0.5 text-xs text-[var(--met-fg-dim)]">{pl.count} 首</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
