import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlayTimeData } from "@met/core";
import { legacyStorage } from "./persist";

/**
 * 全屏播放器的歌词视图三态(取代原来的布尔 pureLyricMode):
 * hidden 只有封面 / both 封面 + 歌词 / only 只有歌词。
 * 旧的 pureLyricMode 只能表达 both 与 only 两态,故整体替换;
 * 老数据里残留的 pureLyricMode 不再被读取,升级后统一从 both 起步。
 */
export type LyricViewMode = "hidden" | "both" | "only";

/**
 * 站点状态。字段与旧 stores/siteStatus.js 一致(persist key "siteStatus",
 * 且仅持久化旧 paths 列出的子集)。
 */
export interface StatusStoreState {
  asideMenuCollapsed: boolean;
  /**
   * 桌面左侧栏是否展开为完整菜单(展开后与窄屏抽屉同一形态)。
   * 没有复用旧的 asideMenuCollapsed:它已持久化且默认 false,
   * 按「collapsed」语义解读会让所有老用户升级后直接变成展开态。
   */
  asideMenuExpanded: boolean;
  searchInputFocus: boolean;
  showPlayBar: boolean;
  playState: boolean;
  playLoading: boolean;
  playUseOtherSource: boolean;
  playListShow: boolean;
  showFullPlayer: boolean;
  playerControlShow: boolean;
  playSeek: number;
  playSeekMs: number;
  /** 音乐资源自动缓存的下载进度(0-100);-1 表示当前没有在下载 */
  songCacheProgress: number;
  hasNextSong: boolean;
  coverTheme: Record<string, unknown>;
  coverBackground: string | null;
  lyricViewMode: LyricViewMode;
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
  roomCode: string;
  roomUuid: string;
  /** 设置悬浮层是否展示(React 新增,不持久化——不在 PERSIST_PATHS 白名单内) */
  showSettingsPanel: boolean;
}

/** 旧 pinia persist 的 paths 白名单,保持一致 */
const PERSIST_PATHS = [
  "asideMenuCollapsed",
  "asideMenuExpanded",
  "lyricViewMode",
  "playRate",
  "playVolume",
  "playVolumeMute",
  "playIndex",
  "playMode",
  "playSongMode",
  "playHeartbeatMode",
  "playTimeData",
  "playSongLyricIndex",
  "coverTheme",
] as const;

export const useStatusStore = create<StatusStoreState>()(
  persist(
    (): StatusStoreState => ({
      asideMenuCollapsed: false,
      asideMenuExpanded: false,
      searchInputFocus: false,
      showPlayBar: true,
      playState: false,
      playLoading: false,
      playUseOtherSource: false,
      playListShow: false,
      showFullPlayer: false,
      playerControlShow: true,
      playSeek: 0,
      playSeekMs: 0,
      songCacheProgress: -1,
      hasNextSong: false,
      coverTheme: {},
      coverBackground: null,
      lyricViewMode: "both" as LyricViewMode,
      playSongLyricIndex: -1,
      playTimeData: {
        currentTime: 0,
        duration: 0,
        bar: 0 as string | number,
        played: "00:00",
        durationTime: "00:00",
      },
      playRate: 1,
      playVolume: 0.7,
      playVolumeMute: 0,
      playIndex: 0,
      playMode: "normal" as const,
      playSongMode: "normal" as const,
      playHeartbeatMode: false,
      isInRoom: false,
      roomCode: "",
      roomUuid: "",
      showSettingsPanel: false,
    }),
    {
      name: "siteStatus",
      storage: legacyStorage(),
      partialize: (state) =>
        Object.fromEntries(PERSIST_PATHS.map((k) => [k, state[k]])) as unknown as StatusStoreState,
    },
  ),
);
