/**
 * 播放引擎装配:把 zustand stores、平台能力、宿主契约注入 core 引擎。
 * 应用启动时调用一次 setupPlayer()。
 */
import { toast } from "sonner";
import { configurePlayer, createDefaultRoomState } from "@met/core";
import type {
  ListenTogetherBridge,
  MusicState,
  Notifier,
  PlayerSettings,
  SiteState,
  StatusState,
} from "@met/core";
import { asGetter, bindStore } from "./bind";
import { useMusicStore, getPlaySongData, setPlayHistory, setPersonalFm } from "@/stores/music";
import { useStatusStore } from "@/stores/status";
import { useSettingsStore } from "@/stores/settings";
import { useSiteDataStore } from "@/stores/siteData";
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

/**
 * 一起听桥接。U2 阶段为占位实现(isInRoom 恒为 false,引擎不会调用);
 * U3 接入 ListenTogetherClient 后替换为真实实现。
 */
const ltBridge: ListenTogetherBridge = {
  roomState: createDefaultRoomState(),
  serverTimeOffset: 0,
  sendNext: () => console.warn("[lt] 未接入(U3)"),
  sendChangeIndex: () => console.warn("[lt] 未接入(U3)"),
  sendPlayOrPause: () => console.warn("[lt] 未接入(U3)"),
  sendSeek: () => console.warn("[lt] 未接入(U3)"),
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
      // coverGradient:封面取色留待 U3(cover-color DOM 实现)
      onTick: broadcastHook,
    },
  });
};
