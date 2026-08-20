/**
 * 根布局(路由 __root):左侧窄侧边栏 + 顶栏 + 主内容区 + 播放条。
 *
 * 宿主按钮区是契约 v2 对旧 .main-nav DOM 注入的替代:
 * useHostStore().isHosted 为 true 时渲染「设置」「隐藏」按钮,
 * 分别调用宿主注册的 onOpenSettings / onHideWindow 回调(仍走宿主回调,与应用内设置悬浮层无关)。
 *
 * 侧栏「设置」项不再 navigate 到 /setting,改为打开 SettingsOverlay 悬浮层
 * (useStatusStore.showSettingsPanel);/setting 路由页保留用于深链兼容。
 *
 * P1 布局/导航域补齐:
 * - 顶栏前进/后退(旧 MainNav 的 router.go(±1) → router.history.back/forward);
 * - 顶栏明暗一键切换(旧 siteSettings.setThemeType 语义:themeAuto=false + toast);
 * - isInRoom 时顶栏「一起听中」脉冲徽标(旧 UserData 的 quick-listen 按钮);
 * - 侧栏底部「隔空播放」房外入口(旧 UserData goToPlayer:sessionId 版;
 *   房内 roomUuid 版在 RoomHeader);
 * - 路由 pathname 变化时主滚动区回顶(旧 afterEach 回顶;search 变化如翻页不回顶,
 *   与旧「翻页各页自理」行为一致);
 * - <768px:侧栏隐藏,顶栏汉堡开左侧抽屉(遮罩 + 复用 nav 项与 UserPanel),
 *   任意导航后自动关(对旧 <900px 汉堡下拉意图的现代化实现;
 *   asideMenuCollapsed 字段保持不动,留待 U3)。
 *
 * P2 布局/全局平台细节:
 * - 回顶按钮:main 滚动超 400px 右下浮现,点击平滑回顶,bottom 90px 避让播放条
 *   (对照旧 n-back-top 110/50 避让);
 * - no-sider:settings.showSider=false 时隐藏桌面侧栏,内容区 max-w 1200 居中窄版
 *   (对照旧 .main-layout.no-sider;窄屏汉堡抽屉不受影响);
 * - 顶部 2px 路由加载进度条(旧 $loadingBar 的简版替代,
 *   router.subscribe onBeforeLoad/onResolved 驱动)。
 */
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import {
  Airplay,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  History,
  Home,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useHostStore } from "@/host";
import { useSettingsStore } from "@/stores/settings";
import { useStatusStore } from "@/stores/status";
import { getSessionId } from "@/platform/web";
import SearchSuggest from "@/components/search-suggest/SearchSuggest";
import SettingsOverlay from "@/components/settings-overlay/SettingsOverlay";
import PlayerBar from "@/components/player/PlayerBar";
import FullPlayer from "@/components/player/FullPlayer";
import UserPanel from "@/components/user/UserPanel";

const NAV_LINKS = [
  { to: "/", label: "主页", icon: Home },
  { to: "/search/songs", label: "搜索", icon: Search },
  { to: "/history", label: "最近播放", icon: History },
  { to: "/listen-together", label: "一起听", icon: Users },
] as const;

/** 顶栏图标按钮统一样式 */
const iconBtnCls =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--met-fg-dim)] " +
  "transition-colors hover:bg-[var(--met-bg-elevated)] hover:text-[var(--met-fg)]";

/** 明暗一键切换(旧 siteSettings.setThemeType:切主题 + 关闭跟随系统 + toast) */
const toggleThemeType = () => {
  const next = useSettingsStore.getState().themeType === "light" ? "dark" : "light";
  useSettingsStore.setState({ themeType: next, themeAuto: false });
  toast(`已切换至${next === "light" ? "浅色" : "深色"}模式`);
};

/** 隔空播放房外入口(旧 UserData goToPlayer:任意时刻可开,sid 用本地 sessionId) */
const openRemotePlayer = () => {
  window.open(`/player/?sid=${getSessionId()}`, "_blank");
};

/**
 * 顶部 2px 路由加载进度条(旧 Provider $loadingBar 的简版替代):
 * onBeforeLoad 从 0 缓慢爬向 80%,onResolved 冲至 100% 后淡出。
 */
const RouteProgress = () => {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let hideTimer: number | undefined;
    let failsafeTimer: number | undefined;
    let pending = false;
    const hide = () => {
      setVisible(false);
      setWidth(0);
    };
    const unsubStart = router.subscribe("onBeforeLoad", () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(failsafeTimer);
      pending = true;
      setVisible(true);
      setWidth(0);
      // 双 RAF:先渲染宽度 0,再进入缓爬过渡
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (pending) setWidth(80);
        });
      });
      // 兜底:导航异常未触发 onResolved 时 10s 后自行隐藏
      failsafeTimer = window.setTimeout(() => {
        pending = false;
        hide();
      }, 10_000);
    });
    const unsubDone = router.subscribe("onResolved", () => {
      if (!pending) return; // 忽略初始化等非导航触发
      pending = false;
      window.clearTimeout(failsafeTimer);
      setWidth(100);
      hideTimer = window.setTimeout(hide, 400);
    });
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(failsafeTimer);
      unsubStart();
      unsubDone();
    };
  }, [router]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}
    >
      <div
        className="h-full bg-[var(--met-primary)]"
        style={{
          width: `${width}%`,
          transition:
            width === 0
              ? "none"
              : width === 100
                ? "width 0.2s ease"
                : "width 6s cubic-bezier(0.1, 0.6, 0.2, 1)",
        }}
      />
    </div>
  );
};

/**
 * 侧栏内容(nav 项 + 设置 + 用户面板 + 隔空播放),
 * rail = 桌面窄侧栏(纵向图标列),drawer = 窄屏抽屉(横向整行)。
 */
const SidebarContent = ({
  variant,
  onNavigate,
}: {
  variant: "rail" | "drawer";
  onNavigate?: () => void;
}) => {
  const showSettingsPanel = useStatusStore((s) => s.showSettingsPanel);
  const isRail = variant === "rail";

  const itemBase = isRail
    ? "flex w-14 flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-xs"
    : "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm";
  const itemIdle =
    "text-[var(--met-fg-dim)] transition-colors hover:bg-[var(--met-bg-elevated)] hover:text-[var(--met-fg)]";
  const itemActive = "bg-[var(--met-bg-elevated)] font-semibold text-[var(--met-primary)]";

  return (
    <>
      <nav
        className={
          isRail
            ? "flex shrink-0 flex-col items-center gap-1"
            : "flex shrink-0 flex-col gap-0.5 px-2"
        }
      >
        {NAV_LINKS.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            onClick={onNavigate}
            className={`${itemBase} ${itemIdle}`}
            activeProps={{ className: itemActive }}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </Link>
        ))}
        {/* 设置:打开悬浮层,不再跳转 /setting */}
        <button
          type="button"
          onClick={() => {
            useStatusStore.setState({ showSettingsPanel: true });
            onNavigate?.();
          }}
          className={`${itemBase} cursor-pointer transition-colors ${
            showSettingsPanel ? itemActive : itemIdle
          }`}
        >
          <Settings className="h-5 w-5" aria-hidden />
          设置
        </button>
      </nav>
      {/* 用户面板(导航项之下的滚动区) */}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-1">
        <UserPanel />
      </div>
      {/* 隔空播放(房外入口,任意时刻可开;房内 roomUuid 版在 RoomHeader) */}
      <div className={`shrink-0 border-t border-[var(--met-border)] pt-2 ${isRail ? "flex justify-center px-1" : "px-2"}`}>
        <button
          type="button"
          title="隔空播放"
          onClick={openRemotePlayer}
          className={`${itemBase} cursor-pointer ${itemIdle}`}
        >
          <Airplay className="h-5 w-5" aria-hidden />
          {/* 窄栏下仅图标,避免四字折行 */}
          {isRail ? null : "隔空播放"}
        </button>
      </div>
    </>
  );
};

const RootLayout = () => {
  const router = useRouter();
  const isHosted = useHostStore((s) => s.isHosted);
  const callbacks = useHostStore((s) => s.callbacks);
  const themeType = useSettingsStore((s) => s.themeType);
  const showSider = useSettingsStore((s) => s.showSider);
  const isInRoom = useStatusStore((s) => s.isInRoom);

  // 窄屏抽屉
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 路由切换回顶:仅 pathname 变化(search 变化如翻页不回顶,翻页各页自理)
  const mainRef = useRef<HTMLElement | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // 回顶按钮:main 滚动超过 400px 时浮现(对照旧 n-back-top)
  const [showBackTop, setShowBackTop] = useState(false);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setShowBackTop(el.scrollTop > 400);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // 任意导航(含仅 search 变化,如侧栏切换另一歌单)后关闭抽屉
  const locationHref = useRouterState({ select: (s) => s.location.href });
  useEffect(() => {
    setDrawerOpen(false);
  }, [locationHref]);

  return (
    <div className="flex h-full flex-col bg-[var(--met-bg)] text-[var(--met-fg)]">
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--met-border)] px-4">
        {/* 窄屏:汉堡开抽屉 */}
        <button
          type="button"
          title="菜单"
          aria-label="打开菜单"
          onClick={() => setDrawerOpen(true)}
          className={`${iconBtnCls} md:hidden`}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Link to="/" className="shrink-0 text-sm font-bold tracking-wide">
          MeT Music
        </Link>
        {/* 前进/后退(旧 MainNav router.go(±1);窄屏下让位给搜索框) */}
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <button
            type="button"
            title="后退"
            aria-label="后退"
            onClick={() => router.history.back()}
            className={iconBtnCls}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            title="前进"
            aria-label="前进"
            onClick={() => router.history.forward()}
            className={iconBtnCls}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {/* 搜索框 + 搜索建议下拉 */}
        <div className="flex min-w-0 flex-1 justify-center">
          <SearchSuggest />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* 「一起听中」常驻脉冲徽标(旧 UserData quick-listen) */}
          {isInRoom ? (
            <Link
              to="/listen-together"
              title="一起听中,点击回到房间"
              className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-[var(--met-primary)] px-3 text-xs font-semibold text-[var(--met-primary)] transition-colors hover:bg-[var(--met-bg-elevated)]"
            >
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--met-primary)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--met-primary)]" />
              </span>
              <Users className="h-4 w-4 sm:hidden" aria-hidden />
              <span className="hidden sm:inline">一起听中</span>
            </Link>
          ) : null}
          {/* 明暗一键切换(位于宿主按钮区左侧) */}
          <button
            type="button"
            title={themeType === "dark" ? "切换至浅色模式" : "切换至深色模式"}
            aria-label={themeType === "dark" ? "切换至浅色模式" : "切换至深色模式"}
            onClick={toggleThemeType}
            className={iconBtnCls}
          >
            {themeType === "dark" ? (
              <Sun className="h-5 w-5" aria-hidden />
            ) : (
              <Moon className="h-5 w-5" aria-hidden />
            )}
          </button>
          {/* 宿主按钮区(契约 v2:替代旧 .main-nav DOM 注入) */}
          {isHosted ? (
            <>
              <button
                type="button"
                title="设置"
                aria-label="设置"
                onClick={() => callbacks?.onOpenSettings?.()}
                className={iconBtnCls}
              >
                <Settings className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                title="隐藏"
                aria-label="隐藏"
                onClick={() => callbacks?.onHideWindow?.()}
                className={iconBtnCls}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左侧窄侧边栏:<768px 隐藏(改走抽屉);showSider=false 时桌面亦隐藏
            (no-sider,窄屏汉堡抽屉不受影响);
            asideMenuCollapsed 的完整宽度联动留待 U3,此处固定窄栏 */}
        {showSider ? (
          <aside className="hidden w-16 shrink-0 flex-col border-r border-[var(--met-border)] py-3 md:flex">
            <SidebarContent variant="rail" />
          </aside>
        ) : null}

        {/* 主内容区(底部预留 72px 给播放条);
            no-sider 时内容居中窄版(对照旧 .no-sider .main-router max-width) */}
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto pb-[72px]">
          <div className={showSider ? undefined : "mx-auto w-full max-w-[1200px]"}>
            <Outlet />
          </div>
        </main>
      </div>

      {/* 回顶按钮(滚动超 400px 浮现;bottom 90px 避让播放条) */}
      <button
        type="button"
        title="回到顶部"
        aria-label="回到顶部"
        tabIndex={showBackTop ? 0 : -1}
        onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed right-6 bottom-[90px] z-30 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[var(--met-border)] bg-[var(--met-bg-elevated)] text-[var(--met-fg)] shadow-lg transition-all duration-300 hover:text-[var(--met-primary)] ${
          showBackTop ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <ChevronUp className="h-6 w-6" aria-hidden />
      </button>

      {/* 顶部路由加载进度条 */}
      <RouteProgress />

      {/* 窄屏左侧抽屉(遮罩 + 侧栏内容复用) */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            aria-hidden
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col border-r border-[var(--met-border)] bg-[var(--met-bg)] py-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between px-4">
              <span className="text-sm font-bold tracking-wide">MeT Music</span>
              <button
                type="button"
                title="关闭菜单"
                aria-label="关闭菜单"
                onClick={() => setDrawerOpen(false)}
                className={iconBtnCls}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <SidebarContent variant="drawer" onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}

      {/* 播放条与全屏播放器 */}
      <PlayerBar />
      <FullPlayer />

      {/* 全局设置悬浮层 */}
      <SettingsOverlay />
    </div>
  );
};

export default RootLayout;
