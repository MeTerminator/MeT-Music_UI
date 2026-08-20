import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api, type Artist, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import { Pagination } from "@/components/ui/pagination";
import { useSettingsStore } from "@/stores/settings";

/** 歌手展示文本(artists 可能是数组或字符串) */
const artistsText = (artists: Song["artists"]): string => {
  if (!artists) return "";
  if (typeof artists === "string") return artists;
  return artists.map((a: Artist) => a?.name).filter(Boolean).join(" / ");
};

/** 搜索结果 - 专辑(对照旧 src/views/Search/albums.vue,type=10) */
export default function Albums() {
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
    queryKey: ["search", "albums", keywords, page, searchLoadSize],
    queryFn: () =>
      api.getSearchRes(keywords, searchLoadSize, (page - 1) * searchLoadSize, 10),
    enabled: !!keywords,
  });

  const totalCount: number = data?.result?.albumCount ?? 0;
  const albums = useMemo<Song[]>(
    () => formatData(data?.result?.albums, "album") ?? [],
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

  if (!albums.length) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">
        很抱歉,未能找到与 {keywords} 相关的任何专辑
      </div>
    );
  }

  return (
    <div>
      {/* 专辑卡片 */}
      <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {albums.map((album) => {
          const artistLine = artistsText(album.artists);
          return (
            <button
              key={String(album.id)}
              type="button"
              onClick={() => navigate({ to: "/album", search: { id: String(album.id) } })}
              className="group flex flex-col text-left"
            >
              <div className="relative aspect-square overflow-hidden rounded-lg bg-[var(--met-bg-elevated)]">
                {album.coverSize?.s ? (
                  <img
                    src={album.coverSize.s}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : null}
              </div>
              <span
                className="mt-2 line-clamp-2 text-sm text-[var(--met-fg)] group-hover:text-[var(--met-primary)]"
                title={album.name}
              >
                {album.name}
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
