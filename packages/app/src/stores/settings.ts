import { create } from "zustand";
import { persist } from "zustand/middleware";
import { legacyStorage } from "./persist";

/**
 * 站点设置。字段与旧 stores/siteSettings.js 完全一致(persist key 同为 "siteSettings")。
 */
export interface SettingsState {
  // 基础配置
  closeTip: boolean;
  closeType: "close" | "hide";
  showTaskbarProgress: boolean;
  showSearchHistory: boolean;
  showSider: boolean;
  siderShowCover: boolean;
  siteFont: string;
  lyricFont: string;
  // 主题部分
  themeType: "dark" | "light";
  themeAuto: boolean;
  themeTypeName: string;
  themeTypeData: Record<string, unknown>;
  themeAutoCover: boolean;
  themeAutoCoverType: string;
  // 播放部分
  html5Player: boolean;
  playCoverType: string;
  songLevel: string;
  autoPlay: boolean;
  songVolumeFade: boolean;
  countDownShow: boolean;
  bottomLyricShow: boolean;
  playerBackgroundType: string;
  amllPlayerBackgroundFlowSpeed: number;
  memorySeek: boolean;
  playSearch: boolean;
  showPlaylistCount: boolean;
  useMusicCache: boolean;
  simulationPlaying: boolean;
  listenTogetherSyncThreshold: number;
  // 数量部分
  loadSize: number;
  searchLoadSize: number;
  // 歌词部分
  lyricsOffset: number;
  /** 歌词时间平移(ms,可负):正值让歌词整体延后出现 */
  lyricsShiftMs: number;
  lyricsAMOffset: number;
  lyricsAMEndTimeOffset: number;
  lyricsAMttmlUseOffset: boolean;
  lyricsHookOffset: number;
  useAMLyrics: boolean;
  useAMSpring: boolean;
  useAMScale: boolean;
  useAMttmlDB: boolean;
  removeInfo: boolean;
  removeAMInfo: boolean;
  lrcMousePause: boolean;
  lyricsFontSize: number;
  lyricsBlur: boolean;
  showYrc: boolean;
  showYrcAnimation: boolean;
  lyricsPosition: string;
  lyricsBlock: string;
  showTransl: boolean;
  showRoma: boolean;
}

export const defaultSettings: SettingsState = {
  closeTip: true,
  closeType: "hide",
  showTaskbarProgress: false,
  showSearchHistory: true,
  showSider: true,
  siderShowCover: true,
  siteFont: "harmony_reg",
  lyricFont: "harmony_bold",
  themeType: "dark",
  themeAuto: true,
  themeTypeName: "green",
  themeTypeData: {},
  themeAutoCover: true,
  themeAutoCoverType: "secondary",
  html5Player: true,
  playCoverType: "cover",
  songLevel: "hq",
  autoPlay: false,
  songVolumeFade: true,
  countDownShow: true,
  bottomLyricShow: true,
  playerBackgroundType: "amllAnimation",
  amllPlayerBackgroundFlowSpeed: 2,
  memorySeek: true,
  playSearch: false,
  showPlaylistCount: true,
  useMusicCache: false,
  simulationPlaying: false,
  listenTogetherSyncThreshold: 300,
  loadSize: 100,
  searchLoadSize: 30,
  lyricsOffset: 0.4,
  lyricsShiftMs: 0,
  lyricsAMOffset: 150,
  lyricsAMEndTimeOffset: 250,
  lyricsAMttmlUseOffset: false,
  lyricsHookOffset: 0.3,
  useAMLyrics: true,
  useAMSpring: true,
  useAMScale: true,
  useAMttmlDB: true,
  removeInfo: false,
  removeAMInfo: true,
  lrcMousePause: true,
  lyricsFontSize: 46,
  lyricsBlur: false,
  showYrc: true,
  showYrcAnimation: true,
  lyricsPosition: "left",
  lyricsBlock: "start",
  showTransl: true,
  showRoma: true,
};

/** 已下线的设置项:恢复持久化数据时一并抹掉(下次写回即从 localStorage 消失) */
const REMOVED_KEYS = ["showSpectrums"] as const;

export const useSettingsStore = create<SettingsState>()(
  persist(() => ({ ...defaultSettings }), {
    name: "siteSettings",
    storage: legacyStorage<SettingsState>(),
    merge: (persisted, current) => {
      const rest = { ...((persisted ?? {}) as Partial<SettingsState>) } as Record<string, unknown>;
      for (const key of REMOVED_KEYS) delete rest[key];
      return { ...current, ...rest } as SettingsState;
    },
  }),
);
