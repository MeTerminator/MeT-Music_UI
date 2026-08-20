import { Link, Outlet, useSearch } from "@tanstack/react-router";
import SearchDiscover from "./SearchDiscover";

// tab 顺序对齐旧 Search/index.vue:单曲 / 歌手 / 专辑 / 歌单 / 视频
const TABS = [
  { to: "/search/songs", label: "单曲" },
  { to: "/search/artists", label: "歌手" },
  { to: "/search/albums", label: "专辑" },
  { to: "/search/playlists", label: "歌单" },
  { to: "/search/videos", label: "视频" },
] as const;

/** 搜索页布局:标题 + tab 导航 + 子路由出口 */
export default function SearchLayout() {
  const search = useSearch({ strict: false }) as { keywords?: string };
  const keywords = search.keywords ?? "";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-8 py-8 max-md:px-4">
      <h1 className="text-3xl font-bold text-[var(--met-fg)]">
        {keywords ? (
          <>
            「<span className="text-[var(--met-primary)]">{keywords}</span>」的搜索结果
          </>
        ) : (
          "发现"
        )}
      </h1>

      {/* 无关键词:隐藏结果 tab,展示搜索历史 + 热搜榜发现面板 */}
      {keywords.trim() ? (
        <>
          <nav className="mt-4 flex gap-1 border-b border-[var(--met-border)]">
            {TABS.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                search={{ keywords }}
                className="rounded-t-md px-4 py-2 text-sm text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-fg)]"
                activeProps={{
                  className:
                    "rounded-t-md px-4 py-2 text-sm font-medium text-[var(--met-primary)] border-b-2 border-[var(--met-primary)]",
                }}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          <div className="min-h-0 flex-1 pt-2">
            <Outlet />
          </div>
        </>
      ) : (
        <SearchDiscover />
      )}
    </div>
  );
}
