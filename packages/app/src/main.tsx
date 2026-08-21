import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { toast, Toaster } from "sonner";
import { initPlayer, setRestoreSeek } from "@met/core";
import { initHostGlobals } from "./host";
import { initOfflineHandler } from "./platform/offline";
import { initGlobalShortcuts } from "./platform/shortcuts";
import { initTheme } from "./platform/theme";
import { setupPlayer } from "./player/setup";
import { router } from "./router";
import { useMusicStore } from "./stores/music";
import { useSettingsStore } from "./stores/settings";
import { useStatusStore } from "./stores/status";
import packageJson from "../package.json";
import "./styles.css";

/**
 * 启动引导(对齐旧 App.vue onMounted):
 *   1. 复位持久化残留的瞬时状态(播放中/加载中/一起听房间标记);
 *   2. 交付上次播放位置(记忆播放位置:playTimeData 随播放持久化在 siteStatus 中,
 *      刷新/重新进入时把它交给引擎,由 createPlayer 装载完成后恢复一次);
 *   3. 若播放列表非空,恢复上次歌曲(是否自动播放由 settings.autoPlay 决定)。
 * initPlayer 内部的 currentPlayId 天然防 StrictMode/重入。
 */
const bootstrapPlayback = (): void => {
  const status = useStatusStore.getState();
  const settings = useSettingsStore.getState();
  useStatusStore.setState({
    playState: false,
    playLoading: false,
    songCacheProgress: -1,
    isInRoom: false,
    roomCode: "",
    roomUuid: "",
  });
  if (settings.memorySeek) {
    setRestoreSeek(
      status.playTimeData?.currentTime ?? 0,
      useMusicStore.getState().playSongData?.id ?? null,
    );
  }
  if (useMusicStore.getState().playList.length) {
    void initPlayer(settings.autoPlay);
  }
};

/**
 * 版权声明 console banner(对照旧 main.js 56-68;
 * 版本取自 package.json,作者对齐旧根 package.json 的 author 字段)
 */
const printCopyright = (): void => {
  console.info(
    `%cMeT-Music %c \n\n版本: ${packageJson.version}\n作者: MeTerminator`,
    "color:#f55e55;font-size:26px;font-weight:bold;",
    "font-size:16px",
  );
  console.info(
    "若站点出现异常，可尝试在下方输入 %c$cleanAll()%c 然后按回车来重置",
    "background: #eaeffd;color:#f55e55;padding: 4px 6px;border-radius:8px;",
    "background:unset;color:unset;",
  );
};

/**
 * PWA 更新提示(对照旧 App.vue 77-94):
 * registerType 保持 autoUpdate(skipWaiting + clientsClaim),
 * 新 Service Worker 接管(controllerchange)后弹常驻 toast,点击刷新应用。
 */
const initPwaUpdateToast = (): void => {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    console.info("站点资源有更新，请刷新以应用更新");
    toast.info("站点已更新，点击刷新以应用", {
      duration: Infinity,
      closeButton: true,
      action: {
        label: "刷新",
        onClick: () => window.location.reload(),
      },
    });
  });
};

// 宿主契约全局与播放引擎装配(必须先于任何 UI 交互)
printCopyright();
initHostGlobals();
initPwaUpdateToast();
initOfflineHandler();
setupPlayer();
initTheme();
bootstrapPlayback();
initGlobalShortcuts();

// dev 调试出口
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__debugStores = {
    music: useMusicStore,
    status: useStatusStore,
    settings: useSettingsStore,
  };
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Toaster 主题跟随 settings.themeType(旧版浅色主题下 toast 同步变浅) */
const ThemedToaster = () => {
  const themeType = useSettingsStore((s) => s.themeType);
  return <Toaster theme={themeType} position="top-center" richColors />;
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ThemedToaster />
    </QueryClientProvider>
  </StrictMode>,
);
