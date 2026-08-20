import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { initPlayer } from "@met/core";
import { initHostGlobals } from "./host";
import { initOfflineHandler } from "./platform/offline";
import { initGlobalShortcuts } from "./platform/shortcuts";
import { initTheme } from "./platform/theme";
import { setupPlayer } from "./player/setup";
import { router } from "./router";
import { useMusicStore } from "./stores/music";
import { useSettingsStore } from "./stores/settings";
import { useStatusStore } from "./stores/status";
import "./styles.css";

/**
 * 启动引导(对齐旧 App.vue onMounted):
 *   1. 复位持久化残留的瞬时状态(播放中/加载中/一起听房间标记);
 *   2. 若播放列表非空,恢复上次歌曲(是否自动播放由 settings.autoPlay 决定)。
 * initPlayer 内部的 currentPlayId 天然防 StrictMode/重入。
 */
const bootstrapPlayback = (): void => {
  useStatusStore.setState({
    playState: false,
    playLoading: false,
    isInRoom: false,
    roomCode: "",
    roomUuid: "",
  });
  if (useMusicStore.getState().playList.length) {
    void initPlayer(useSettingsStore.getState().autoPlay);
  }
};

// 宿主契约全局与播放引擎装配(必须先于任何 UI 交互)
initHostGlobals();
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
