import { create } from "zustand";
import { persist } from "zustand/middleware";
import { legacyStorage } from "./persist";
import type { IsolationRendererOptions, OptimizeLyricOptions, spring } from "@applemusic-like-lyrics/core";
import { NETEASE_LEVELS } from "@met/core";

/**
 * 站点设置。沿用旧 siteSettings 持久化格式，并补齐播放器与 AMLL 可调参数。
 */
export interface SettingsState {
  // 基础配置
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
  neteaseSongLevel: string;
  autoPlay: boolean;
  songVolumeFade: boolean;
  countDownShow: boolean;
  bottomLyricShow: boolean;
  playerBackgroundType: string;
  amllPlayerBackgroundFlowSpeed: number;
  coverLayout: "default" | "fullscreen";
  coverLyricRatio: number;
  amllBackgroundFPS: number;
  amllBackgroundRenderScale: number;
  amllBackgroundStatic: boolean;
  amllBackgroundLowFreqVolume: number;
  amllBackgroundLyricReactive: boolean;
  amllBackgroundRenderer: "mesh" | "pixi" | "isolation";
  amllIsolationOptions: IsolationRendererOptions;
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
  amllAlignPosition: number;
  amllAlignAnchor: "top" | "center" | "bottom";
  amllHidePassedLines: boolean;
  amllWordFadeWidth: number;
  amllLineWidth: number;
  amllLinePadding: number;
  amllBGLineScale: number;
  amllMaskMode: "" | "full-mask" | "partial-mask";
  amllMaskChar: string;
  amllOptimizeOptions: OptimizeLyricOptions;
  amllSpringY: spring.SpringParams;
  amllSpringScale: spring.SpringParams;
  useAMScale: boolean;
  useAMBlur: boolean;
  useAMttmlDB: boolean;
  removeInfo: boolean;
  removeAMInfo: boolean;
  lrcMousePause: boolean;
  lyricsFontSize: number;
  /** 歌词字重;0 表示跟随所选歌词字体自带的字重(不覆盖),否则为 100-900 */
  lyricFontWeight: number;
  lyricsBlur: boolean;
  showYrc: boolean;
  showYrcAnimation: boolean;
  lyricsPosition: string;
  lyricsBlock: string;
  showTransl: boolean;
  showRoma: boolean;
}

export const defaultSettings: SettingsState = {
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
  neteaseSongLevel: "exhigh",
  autoPlay: false,
  songVolumeFade: true,
  countDownShow: true,
  bottomLyricShow: true,
  playerBackgroundType: "amllAnimation",
  amllPlayerBackgroundFlowSpeed: 1,
  coverLayout: "default",
  coverLyricRatio: 0.45,
  amllBackgroundFPS: 30,
  amllBackgroundRenderScale: 0.5,
  amllBackgroundStatic: false,
  amllBackgroundLowFreqVolume: 1,
  amllBackgroundLyricReactive: true,
  amllBackgroundRenderer: "mesh",
  amllIsolationOptions: { lightWave: false, dithering: true, paletteAlgorithm: "auto" },
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
  amllAlignPosition: 0.25,
  amllAlignAnchor: "center",
  amllHidePassedLines: false,
  amllWordFadeWidth: 0.5,
  amllLineWidth: 0.8,
  amllLinePadding: 1,
  amllBGLineScale: 0.7,
  amllMaskMode: "",
  amllMaskChar: "*",
  amllOptimizeOptions: {
    normalizeSpaces: true, resetLineTimestamps: true, syncMainAndBackgroundLines: true,
    cleanUnintentionalOverlaps: true, tryAdvanceStartTime: true,
  },
  amllSpringY: { mass: 0.9, damping: 15, stiffness: 90, soft: false },
  amllSpringScale: { mass: 2, damping: 25, stiffness: 100, soft: false },
  useAMScale: true,
  useAMBlur: false,
  useAMttmlDB: true,
  removeInfo: false,
  removeAMInfo: true,
  lrcMousePause: true,
  lyricsFontSize: 42,
  lyricFontWeight: 700,
  lyricsBlur: false,
  showYrc: true,
  showYrcAnimation: true,
  lyricsPosition: "left",
  lyricsBlock: "start",
  showTransl: true,
  showRoma: true,
};

/** 已下线的设置项:恢复持久化数据时一并抹掉(下次写回即从 localStorage 消失) */
const REMOVED_KEYS = ["showSpectrums", "showTtmlAuthor"] as const;

export const useSettingsStore = create<SettingsState>()(
  persist(() => ({ ...defaultSettings }), {
    name: "siteSettings",
    storage: legacyStorage<SettingsState>(),
    merge: (persisted, current) => {
      const rest = { ...((persisted ?? {}) as Partial<SettingsState>) } as Record<string, unknown>;
      for (const key of REMOVED_KEYS) delete rest[key];
      if (!NETEASE_LEVELS.includes(rest.neteaseSongLevel as typeof NETEASE_LEVELS[number])) delete rest.neteaseSongLevel;
      // 旧版滚动位置迁移为 AMLL 的连续聚焦位置，保留已有用户偏好。
      if (!("amllAlignPosition" in rest) && "lyricsBlock" in rest) {
        rest.amllAlignPosition = rest.lyricsBlock === "center" ? 0.5 : 0.25;
      }
      const merged = { ...current, ...rest } as SettingsState;
      for (const key of ["amllSpringY", "amllSpringScale", "amllIsolationOptions", "amllOptimizeOptions"] as const) {
        Object.assign(merged, { [key]: { ...current[key], ...merged[key] } });
      }
      return merged;
    },
  }),
);
