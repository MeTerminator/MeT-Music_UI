import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import { formatArtists } from "@/lib/format";
import CoverPlayButton from "@/components/cover/CoverPlayButton";
import { Pagination } from "@/components/ui/pagination";
import { useSettingsStore } from "@/stores/settings";

/** 搜索结果 - 专辑(对照旧 src/views/Search/albums.vue,type=10) */
export default function Albums() {
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
          const artistLine = formatArtists(album.artists);
          return (
            <div key={String(album.id)} className="group relative flex flex-col">
              <button
                type="button"
                onClick={() => navigate({ to: "/album", search: { id: String(album.id) } })}
                className="flex w-full flex-col text-left"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-[var(--met-bg-elevated)]">
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
              {/* hover 播放全部(卡片兄弟层叠,点击不冒泡跳详情) */}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex aspect-square items-center justify-center">
                <CoverPlayButton id={album.id} type="album" className="pointer-events-auto" />
              </div>
            </div>
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
