import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import CoverPlayButton from "@/components/cover/CoverPlayButton";
import { Pagination } from "@/components/ui/pagination";
import { useSettingsStore } from "@/stores/settings";

/** 搜索结果 - 歌单(type=1000,点击进入歌单详情页;分页对齐同目录 Videos.tsx 模式) */
export default function Playlists() {
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
    queryKey: ["search", "playlists", keywords, page, searchLoadSize],
    queryFn: () =>
      api.getSearchRes(keywords, searchLoadSize, (page - 1) * searchLoadSize, 1000),
    enabled: !!keywords,
  });

  const totalCount: number = data?.result?.playlistCount ?? 0;
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

  // 空态文案含关键词(对照旧 Search/playlists.vue 的 n-empty description)
  if (!playlists.length) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">
        很抱歉，未能找到与 “{keywords}” 相关的任何歌单
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {playlists.map((pl) => (
          <div key={String(pl.id)} className="group relative flex flex-col">
            <button
              type="button"
              onClick={() => navigate({ to: "/playlist", search: { id: String(pl.id) } })}
              className="flex w-full flex-col text-left"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-[var(--met-bg-elevated)]">
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
            {/* hover 播放全部(卡片兄弟层叠,点击不冒泡跳详情) */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex aspect-square items-center justify-center">
              <CoverPlayButton id={pl.id} type="playlist" className="pointer-events-auto" />
            </div>
          </div>
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
