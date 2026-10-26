/**
 * 播放引擎装配:把 zustand stores、平台能力、宿主契约注入 core 引擎。
 * 应用启动时调用一次 setupPlayer()。
 */
import { toast } from "sonner";
import { configurePlayer, refreshPlayProgress, refreshLyricProfanity } from "@met/core";
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
import { decodeNacUrl } from "./nac/prepare";
import { unlockNacAudio } from "./nac/stream-audio";
import { broadcastHook } from "@/host";

/** UI 反馈(sonner toast;fatal 用原生 confirm 兜底) */
const notifier: Notifier = {
  info: (m) => toast(m, m.startsWith("TTML 歌词作者：") || m === "使用 TTML 歌词"
    ? { closeButton: true, className: "met-ttml-toast" }
    : undefined),
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
      // 歌词整体不可变替换，读取原始对象，避免动态代理身份变化影响原文映射。
      playSongLyric: asGetter(() => useMusicStore.getState().playSongLyric),
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
      decodeNac: decodeNacUrl,
      unlockNac: unlockNacAudio,
      // 封面取色:写入 coverBackground(引擎)与 coverTheme(取色实现内部 setState)
      coverGradient: getCoverGradient,
      onTick: broadcastHook,
      onSeek: () => useStatusStore.setState((state) => ({
        playSeekRevision: state.playSeekRevision + 1,
      })),
    },
  });

  refreshLyricProfanity();

  // 歌词时间类设置改完立即生效:歌词索引平时只在播放 tick 里重算,
  // 暂停态下不改这一下就完全看不出变化(全屏控制条的 ±10ms 按钮亦经此路径)。
  useSettingsStore.subscribe((state, prev) => {
    if (state.uncensorMaskedProfanity !== prev.uncensorMaskedProfanity) {
      refreshLyricProfanity();
      refreshPlayProgress();
    }
    if (
      state.lyricsShiftMs !== prev.lyricsShiftMs ||
      state.lyricsOffset !== prev.lyricsOffset ||
      state.showYrc !== prev.showYrc
    ) {
      refreshPlayProgress();
    }
  });
};
