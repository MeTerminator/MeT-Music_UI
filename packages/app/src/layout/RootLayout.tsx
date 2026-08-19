/**
 * 根布局(路由 __root):左侧窄侧边栏 + 顶栏 + 主内容区 + 播放条。
 *
 * 宿主按钮区是契约 v2 对旧 .main-nav DOM 注入的替代:
 * useHostStore().isHosted 为 true 时渲染「设置」「隐藏」按钮,
 * 分别调用宿主注册的 onOpenSettings / onHideWindow 回调。
 */
import { useState } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useHostStore } from "@/host";
// —— 以下两个组件由并行任务实现;文件尚未落地时的 TS2307 属预期 ——
import PlayerBar from "@/components/player/PlayerBar";
import FullPlayer from "@/components/player/FullPlayer";

const NAV_ITEMS = [
  { to: "/", label: "主页" },
  { to: "/search/songs", label: "搜索" },
  { to: "/history", label: "最近播放" },
  { to: "/listen-together", label: "一起听" },
  { to: "/setting", label: "设置" },
] as const;

const RootLayout = () => {
  const navigate = useNavigate();
  const isHosted = useHostStore((s) => s.isHosted);
  const callbacks = useHostStore((s) => s.callbacks);
  const [keywords, setKeywords] = useState("");

  const submitSearch = () => {
    const kw = keywords.trim();
    if (!kw) return;
    void navigate({ to: "/search/songs", search: { keywords: kw } });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--met-bg)] text-[var(--met-fg)]">
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--met-border)] px-4">
        <Link to="/" className="shrink-0 text-sm font-bold tracking-wide">
          MeT Music
        </Link>
        <div className="flex flex-1 justify-center">
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitSearch();
            }}
            placeholder="搜索音乐 / 歌手 / 专辑"
            className="h-9 w-full max-w-md rounded-full border border-[var(--met-border)] bg-[var(--met-bg-elevated)] px-4 text-sm text-[var(--met-fg)] outline-none transition-colors placeholder:text-[var(--met-fg-dim)] focus:border-[var(--met-primary)]"
          />
        </div>
        {/* 宿主按钮区(契约 v2:替代旧 .main-nav DOM 注入) */}
        <div className="flex shrink-0 items-center gap-1">
          {isHosted ? (
            <>
              <button
                type="button"
                title="设置"
                aria-label="设置"
                onClick={() => callbacks?.onOpenSettings?.()}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--met-fg-dim)] transition-colors hover:bg-[var(--met-bg-elevated)] hover:text-[var(--met-fg)]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              <button
                type="button"
                title="隐藏"
                aria-label="隐藏"
                onClick={() => callbacks?.onHideWindow?.()}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--met-fg-dim)] transition-colors hover:bg-[var(--met-bg-elevated)] hover:text-[var(--met-fg)]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                </svg>
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左侧窄侧边栏(asideMenuCollapsed 的完整宽度联动留待 U3,此处固定窄栏) */}
        <aside className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-[var(--met-border)] py-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="flex w-14 flex-col items-center rounded-lg px-1 py-2.5 text-xs text-[var(--met-fg-dim)] transition-colors hover:bg-[var(--met-bg-elevated)] hover:text-[var(--met-fg)]"
              activeProps={{
                className: "bg-[var(--met-bg-elevated)] font-semibold text-[var(--met-primary)]",
              }}
            >
              {item.label}
            </Link>
          ))}
        </aside>

        {/* 主内容区(底部预留 72px 给播放条) */}
        <main className="min-w-0 flex-1 overflow-y-auto pb-[72px]">
          <Outlet />
        </main>
      </div>

      {/* 播放条与全屏播放器(并行任务实现) */}
      <PlayerBar />
      <FullPlayer />
    </div>
  );
};

export default RootLayout;
