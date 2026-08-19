/**
 * 播放引擎的依赖注入边界。
 *
 * 引擎从旧 src/utils/Player.js 移植,逻辑照抄;所有对 Pinia store、
 * $message/$dialog、mediaSession、DOM(document.title / Image / Electron IPC)
 * 的隐式依赖在此收敛为显式接口,由应用层(web / Electron renderer)注入。
 *
 * State 三件套的字段名与旧 store 完全一致,便于 U2 阶段用 zustand
 * 实现同构投影并保持 localStorage 持久化键兼容。
 */
import type { Notifier } from "../types/notify";
import type { ParsedLyric, Song } from "../types/song";
import type { RoomState } from "../listen-together/types";

/** 对应旧 stores/musicData.js */
export interface MusicState {
  playList: Song[];
  playSongData: Song;
  privateFmSong?: Song;
  playSongLyric: ParsedLyric;
  /** 私人 FM 模式下返回 privateFmSong,否则 playSongData(旧 getPlaySongData getter) */
  readonly getPlaySongData: Song;
  setPlayHistory(data: Song | null, clean?: boolean): void;
  /** 私人 FM:切换至下一首 FM 歌曲(旧 musicData.setPersonalFm) */
  setPersonalFm(change: boolean): Promise<void>;
}

/** 对应旧 stores/siteStatus.js(引擎触及的字段) */
export interface PlayTimeData {
  currentTime: number;
  duration: number;
  bar: string | number;
  played: string;
  durationTime: string;
}

export interface StatusState {
  playState: boolean;
  playLoading: boolean;
  playUseOtherSource: boolean;
  playSeek: number;
  playSeekMs: number;
  hasNextSong: boolean;
  coverTheme: Record<string, unknown>;
  coverBackground: string | null;
  spectrumsData: number[];
  playSongLyricIndex: number;
  playTimeData: PlayTimeData;
  playRate: number;
  playVolume: number;
  playVolumeMute: number;
  playIndex: number;
  playMode: "normal" | "fm" | "dj";
  playSongMode: "normal" | "random" | "repeat";
  playHeartbeatMode: boolean;
  isInRoom: boolean;
}

/** 对应旧 stores/siteSettings.js(引擎触及的字段) */
export interface PlayerSettings {
  songLevel: string;
  songVolumeFade: boolean;
  memorySeek: boolean;
  useMusicCache: boolean;
  html5Player: boolean;
  showSpectrums: boolean;
  simulationPlaying: boolean;
  showYrc: boolean;
  lyricsOffset: number;
  useAMttmlDB: boolean;
  removeInfo: boolean;
  removeAMInfo: boolean;
  themeAutoCover: boolean;
  themeAutoCoverType: string;
  listenTogetherSyncThreshold: number;
}

/** 对应旧 stores/siteData.js(引擎仅读 userId 用于播放上报) */
export interface SiteState {
  userData: { userId: number | string | null };
}

/**
 * 一起听桥接。引擎不直接持有 ListenTogetherClient,
 * 应用层将 client + 房间状态包装为此接口注入。
 */
export interface ListenTogetherBridge {
  roomState: RoomState;
  serverTimeOffset: number;
  sendNext(): void;
  sendChangeIndex(type: "next" | "prev"): void;
  sendPlayOrPause(): void;
  sendSeek(seconds: number): void;
}

/** 对应旧 utils/mediaSession.js 的五个导出;web 与 Electron 均由平台层实现 */
export interface MediaSessionAdapter {
  bindActions(handlers: Record<string, (details?: { seekTime?: number; seekOffset?: number }) => void>): void;
  setMetadata(meta: { title: string; artist: string; album: string; artwork: { src: string; sizes: string; type: string }[] }): void;
  setPlaybackState(playing: boolean): void;
  updatePosition(state: { duration: number; position: number; playbackRate: number }, force?: boolean): void;
  clear(): void;
}

export const noopMediaSession: MediaSessionAdapter = {
  bindActions: () => {},
  setMetadata: () => {},
  setPlaybackState: () => {},
  updatePosition: () => {},
  clear: () => {},
};

/** 环境能力(浏览器/Electron 差异全部收敛在这里) */
export interface PlayerEnv {
  /** 更新页面标题(旧 document.title 写入点) */
  setTitle(title: string): void;
  /** 播放上报用会话 id(旧 helper.getSessionId) */
  sessionId(): string;
  /** 致命错误对话框确认后的整页刷新(旧 location.reload) */
  reload(): void;
  /** 本地歌曲封面解析(旧 helper.getLocalCoverData,仅 Electron 宿主有实现) */
  resolveLocalCover?(path: string): Promise<string | undefined>;
  /** 音频缓存:URL → Blob URL(旧 helper.getBlobUrlFromUrl);缺省直接返回原 URL */
  toBlobUrl?(url: string): Promise<string>;
  /** 封面渐变取色(旧 utils/cover-color.getCoverGradient,DOM 实现留在应用层) */
  coverGradient?(coverUrl: string): Promise<string>;
  /**
   * 播放 tick 回调(旧 updateHookData 的调用点)。
   * 应用层在此组装宿主契约 v2 的 HookPayload 并广播,core 不感知契约。
   */
  onTick?(): void;
}

/** 引擎依赖总集 */
export interface PlayerDeps {
  music(): MusicState;
  status(): StatusState;
  settings(): PlayerSettings;
  site(): SiteState;
  lt(): ListenTogetherBridge;
  notify: Notifier;
  media: MediaSessionAdapter;
  env: PlayerEnv;
}
