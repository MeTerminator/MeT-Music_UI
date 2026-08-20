/**
 * 根布局(路由 __root):左侧窄侧边栏 + 顶栏 + 主内容区 + 播放条。
 *
 * 宿主按钮区是契约 v2 对旧 .main-nav DOM 注入的替代:
 * useHostStore().isHosted 为 true 时渲染「设置」「隐藏」按钮,
 * 分别调用宿主注册的 onOpenSettings / onHideWindow 回调(仍走宿主回调,与应用内设置悬浮层无关)。
 *
 * 侧栏「设置」项不再 navigate 到 /setting,改为打开 SettingsOverlay 悬浮层
 * (useStatusStore.showSettingsPanel);/setting 路由页保留用于深链兼容。
 */
import { Link, Outlet } from "@tanstack/react-router";
import { History, Home, Search, Settings, Users, X } from "lucide-react";
import { useHostStore } from "@/host";
import { useStatusStore } from "@/stores/status";
import SearchSuggest from "@/components/search-suggest/SearchSuggest";
import SettingsOverlay from "@/components/settings-overlay/SettingsOverlay";
// —— 以下组件由并行任务实现;文件尚未落地时的 TS2307 属预期 ——
import PlayerBar from "@/components/player/PlayerBar";
import FullPlayer from "@/components/player/FullPlayer";
import UserPanel from "@/components/user/UserPanel";

const NAV_LINKS = [
  { to: "/", label: "主页", icon: Home },
  { to: "/search/songs", label: "搜索", icon: Search },
  { to: "/history", label: "最近播放", icon: History },
  { to: "/listen-together", label: "一起听", icon: Users },
] as const;

const RootLayout = () => {
  const isHosted = useHostStore((s) => s.isHosted);
  const callbacks = useHostStore((s) => s.callbacks);
  const showSettingsPanel = useStatusStore((s) => s.showSettingsPanel);

  return (
    <div className="flex h-full flex-col bg-[var(--met-bg)] text-[var(--met-fg)]">
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--met-border)] px-4">
        <Link to="/" className="shrink-0 text-sm font-bold tracking-wide">
          MeT Music
        </Link>
        {/* 搜索框 + 搜索建议下拉 */}
        <div className="flex flex-1 justify-center">
          <SearchSuggest />
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
                <Settings className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                title="隐藏"
                aria-label="隐藏"
                onClick={() => callbacks?.onHideWindow?.()}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--met-fg-dim)] transition-colors hover:bg-[var(--met-bg-elevated)] hover:text-[var(--met-fg)]"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左侧窄侧边栏(asideMenuCollapsed 的完整宽度联动留待 U3,此处固定窄栏) */}
        <aside className="flex w-16 shrink-0 flex-col border-r border-[var(--met-border)] py-3">
          <nav className="flex shrink-0 flex-col items-center gap-1">
            {NAV_LINKS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="flex w-14 flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-xs text-[var(--met-fg-dim)] transition-colors hover:bg-[var(--met-bg-elevated)] hover:text-[var(--met-fg)]"
                activeProps={{
                  className:
                    "bg-[var(--met-bg-elevated)] font-semibold text-[var(--met-primary)]",
                }}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </Link>
            ))}
            {/* 设置:打开悬浮层,不再跳转 /setting */}
            <button
              type="button"
              onClick={() => useStatusStore.setState({ showSettingsPanel: true })}
              className={`flex w-14 cursor-pointer flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-xs transition-colors ${
                showSettingsPanel
                  ? "bg-[var(--met-bg-elevated)] font-semibold text-[var(--met-primary)]"
                  : "text-[var(--met-fg-dim)] hover:bg-[var(--met-bg-elevated)] hover:text-[var(--met-fg)]"
              }`}
            >
              <Settings className="h-5 w-5" aria-hidden />
              设置
            </button>
          </nav>
          {/* 用户面板(并行任务产出,位于导航项之下的滚动区) */}
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-1">
            <UserPanel />
          </div>
        </aside>

        {/* 主内容区(底部预留 72px 给播放条) */}
        <main className="min-w-0 flex-1 overflow-y-auto pb-[72px]">
          <Outlet />
        </main>
      </div>

      {/* 播放条与全屏播放器(并行任务实现) */}
      <PlayerBar />
      <FullPlayer />

      {/* 全局设置悬浮层 */}
      <SettingsOverlay />
    </div>
  );
};

export default RootLayout;
