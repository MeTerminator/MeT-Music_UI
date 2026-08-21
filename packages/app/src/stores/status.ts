import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlayTimeData } from "@met/core";
import { legacyStorage } from "./persist";

/**
 * 站点状态。字段与旧 stores/siteStatus.js 一致(persist key "siteStatus",
 * 且仅持久化旧 paths 列出的子集)。
 */
export interface StatusStoreState {
  asideMenuCollapsed: boolean;
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
  hasNextSong: boolean;
  coverTheme: Record<string, unknown>;
  coverBackground: string | null;
  pureLyricMode: boolean;
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
  roomCode: string;
  roomUuid: string;
  /** 设置悬浮层是否展示(React 新增,不持久化——不在 PERSIST_PATHS 白名单内) */
  showSettingsPanel: boolean;
}

/** 旧 pinia persist 的 paths 白名单,保持一致 */
const PERSIST_PATHS = [
  "asideMenuCollapsed",
  "pureLyricMode",
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
      hasNextSong: false,
      coverTheme: {},
      coverBackground: null,
      pureLyricMode: false,
      spectrumsData: [] as number[],
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
