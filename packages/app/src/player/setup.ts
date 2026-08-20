/**
 * 播放引擎装配:把 zustand stores、平台能力、宿主契约注入 core 引擎。
 * 应用启动时调用一次 setupPlayer()。
 */
import { toast } from "sonner";
import { configurePlayer } from "@met/core";
import type {
  MusicState,
  Notifier,
  PlayerSettings,
  SiteState,
  StatusState,
} from "@met/core";
import { ltBridge } from "@/stores/listenTogether";
import { asGetter, bindStore } from "./bind";
import { useMusicStore, getPlaySongData, setPlayHistory, setPersonalFm } from "@/stores/music";
import { useStatusStore } from "@/stores/status";
import { useSettingsStore } from "@/stores/settings";
import { useSiteDataStore } from "@/stores/siteData";
import { getCoverGradient } from "@/platform/cover-color";
import { webMediaSession } from "@/platform/media-session";
import { getBlobUrlFromUrl, getSessionId } from "@/platform/web";
import { broadcastHook } from "@/host";

/** UI 反馈(sonner toast;fatal 用原生 confirm 兜底) */
const notifier: Notifier = {
  info: (m) => toast(m),
  success: (m) => toast.success(m),
  warning: (m) => toast.warning(m),
  error: (m) => toast.error(m),
  fatal: (title, content, actionText, action) => {
    if (window.confirm(`${title}\n${content}`)) action();
    void actionText;
  },
};

let configured = false;

export const setupPlayer = (): void => {
  if (configured) return;
  configured = true;

  const musicProxy = bindStore<MusicState, ReturnType<typeof useMusicStore.getState>>(
    useMusicStore,
    {
      getPlaySongData: asGetter(getPlaySongData),
      setPlayHistory,
      setPersonalFm,
    },
  );
  const statusProxy = bindStore<StatusState, ReturnType<typeof useStatusStore.getState>>(
    useStatusStore,
  );
  const settingsProxy = bindStore<PlayerSettings, ReturnType<typeof useSettingsStore.getState>>(
    useSettingsStore,
  );
  const siteProxy = bindStore<SiteState, ReturnType<typeof useSiteDataStore.getState>>(
    useSiteDataStore,
  );

  configurePlayer({
    music: () => musicProxy,
    status: () => statusProxy,
    settings: () => settingsProxy,
    site: () => siteProxy,
    lt: () => ltBridge,
    notify: notifier,
    media: webMediaSession,
    env: {
      setTitle: (title) => {
        document.title = title;
      },
      sessionId: getSessionId,
      reload: () => location.reload(),
      toBlobUrl: getBlobUrlFromUrl,
      // 封面取色:写入 coverBackground(引擎)与 coverTheme(取色实现内部 setState)
      coverGradient: getCoverGradient,
      onTick: broadcastHook,
    },
  });
};
