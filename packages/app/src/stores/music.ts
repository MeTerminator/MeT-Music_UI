import { create } from "zustand";
import { persist } from "zustand/middleware";
import { emptyLyric, type ParsedLyric, type Song } from "@met/core";
import { legacyStorage } from "./persist";
import { useStatusStore } from "./status";

/**
 * 音乐数据。字段与旧 stores/musicData.js 一致(persist key "musicData")。
 */
export interface MusicStoreState {
  playList: Song[];
  playListOld: Song[];
  historyPlaylist: Song[];
  playSongData: Song;
  privateFmSong?: Song;
  playSongSource: number;
  playSongLyric: ParsedLyric;
  localSongPath: string[];
}

export const useMusicStore = create<MusicStoreState>()(
  persist(
    () => ({
      playList: [] as Song[],
      playListOld: [] as Song[],
      historyPlaylist: [] as Song[],
      playSongData: {} as Song,
      playSongSource: 0,
      playSongLyric: emptyLyric(),
      localSongPath: [] as string[],
    }),
    {
      name: "musicData",
      storage: legacyStorage(),
    },
  ),
);

/** 当前播放歌曲(旧 musicData.getPlaySongData getter:FM 模式下取 privateFmSong) */
export const getPlaySongData = (): Song => {
  const { playMode } = useStatusStore.getState();
  const { privateFmSong, playSongData } = useMusicStore.getState();
  return playMode === "fm" && privateFmSong ? privateFmSong : playSongData;
};

/** 更改播放历史(旧 musicData.setPlayHistory,改为不可变更新) */
export const setPlayHistory = (data: Song | null, clean = false): void => {
  if (clean) {
    useMusicStore.setState({ historyPlaylist: [] });
    return;
  }
  if (!data || Object.keys(data).length === 0) return;
  const history = useMusicStore.getState().historyPlaylist;
  const next = history.filter((item) => item?.id !== data.id);
  next.unshift(data);
  // 限制历史记录长度为 500
  if (next.length > 500) next.pop();
  useMusicStore.setState({ historyPlaylist: next });
};

/**
 * 私人 FM 切歌。
 * 注:本 fork 的旧 musicData store 并未实现 setPersonalFm(SPlayer 遗留调用),
 * FM 模式在现 UI 中不可达;保留占位以满足引擎接口。
 */
export const setPersonalFm = async (_change: boolean): Promise<void> => {
  console.warn("[music] setPersonalFm 未实现(私人 FM 在本项目中未启用)");
};
