import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import { Pagination } from "@/components/ui/pagination";
import { useSettingsStore } from "@/stores/settings";

/** 搜索结果 - 歌手(对照旧 src/views/Search/artists.vue,type=100) */
export default function Artists() {
  const search = useSearch({ strict: false }) as { keywords?: string; page?: string };
  const keywords = search.keywords ?? "";
  const navigate = useNavigate();
  const searchLoadSize = useSettingsStore((s) => s.searchLoadSize) || 30;

  // 页码以 URL 为准(旧契约 Number(query.page) || 1,parseInt 容错)
  const parsedPage = Number.parseInt(search.page ?? "", 10);
  const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const setPage = (next: number) =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, page: String(next) }), replace: true });

  // 关键词变化时回到第一页:站内所有更改 keywords 的导航均显式传 search
  // (不携带 page),URL 天然回到第一页;不做 effect 重置(替代原 setPage(1)),
  // 以保证浏览器回退/前进能按历史还原页码。

  const { data, isLoading, isError } = useQuery({
    queryKey: ["search", "artists", keywords, page, searchLoadSize],
    queryFn: () =>
      api.getSearchRes(keywords, searchLoadSize, (page - 1) * searchLoadSize, 100),
    enabled: !!keywords,
  });

  const totalCount: number = data?.result?.artistCount ?? 0;
  const artists = useMemo<Song[]>(
    () => formatData(data?.result?.artists, "artist") ?? [],
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
      <div className="grid grid-cols-3 gap-4 py-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex animate-pulse flex-col items-center">
            <div className="aspect-square w-full rounded-full bg-[var(--met-bg-elevated)]" />
            <div className="mt-2 h-3 w-2/3 rounded bg-[var(--met-bg-elevated)]" />
          </div>
        ))}
      </div>
    );
  }

  if (!artists.length) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">
        很抱歉,未能找到与 {keywords} 相关的任何歌手
      </div>
    );
  }

  return (
    <div>
      {/* 歌手卡片(圆头像栅格) */}
      <div className="grid grid-cols-3 gap-4 py-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {artists.map((artist) => (
          <button
            key={String(artist.id)}
            type="button"
            onClick={() => navigate({ to: "/artist", search: { id: String(artist.id) } })}
            className="group flex flex-col items-center text-center"
          >
            <div className="aspect-square w-full overflow-hidden rounded-full border border-[var(--met-border)] bg-[var(--met-bg-elevated)]">
              {artist.coverSize?.s ? (
                <img
                  src={artist.coverSize.s}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : null}
            </div>
            <span
              className="mt-2 line-clamp-1 w-full text-sm text-[var(--met-fg)] group-hover:text-[var(--met-primary)]"
              title={artist.name}
            >
              {artist.name}
            </span>
          </button>
        ))}
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
