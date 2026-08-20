/**
 * 页面级播放动作(SongList 之外的封面卡等入口复用)。
 */
import { addSongToNext, fadePlayOrPause, initPlayer, type Song } from "@met/core";
import { addSong as ltAddSong } from "@/stores/listenTogether";
import { useMusicStore } from "@/stores/music";
import { useStatusStore } from "@/stores/status";

/**
 * 单曲立即播放(插播语义,对照 SongList 的 behavior="insert" 路径):
 * - 点击的就是当前歌曲 → 播放/暂停切换;
 * - 一起听房内 → 投共享队列;
 * - 否则 addSongToNext 后设 playSongData 并 initPlayer(true) 真正换歌
 *   (仅 addSongToNext(play) 只挪索引恢复 Howl,不加载新曲)。
 */
export const playSongNow = async (song: Song): Promise<void> => {
  const playingId = useMusicStore.getState().playSongData?.id;
  if (playingId != null && playingId === song.id) {
    fadePlayOrPause();
    return;
  }
  if (useStatusStore.getState().isInRoom) {
    ltAddSong(song);
    return;
  }
  useStatusStore.setState({ playMode: "normal" });
  addSongToNext(song, true);
  useMusicStore.setState({ playSongData: song });
  await initPlayer(true);
};
