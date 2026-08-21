import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { api, playAllSongs, playOrPause, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import { useMusicStore } from "@/stores/music";
import { useStatusStore } from "@/stores/status";

interface CoverPlayButtonProps {
  /** 歌单 / 专辑 id */
  id?: number | string;
  /** 列表类型(对照旧 CoverPlayBtn 的 type prop;此处仅移植 playlist/album) */
  type?: "playlist" | "album";
  /** 按钮直径(px,默认 44) */
  size?: number;
  className?: string;
}

/**
 * 封面卡片 hover 播放按钮(移植自旧 src/components/Cover/CoverPlayBtn.vue):
 * - 点击拉取歌单(getAllPlayList(id, 500, 0))/专辑(getAlbumDetail)曲目,
 *   formatData 后交由 playAllSongs 整表播放(仅加载前 500 首,对照旧实现);
 * - 拉取中显示加载转圈(对照旧 playLoading);
 * - 当前正在播放该歌单/专辑内歌曲时显示暂停图标,点击 playOrPause 切换
 *   (对照旧 isHasSongs !== -1 && playState 分支,66-72 / 134-140);
 * - 一起听房内点击仅 toast 提示,不改动播放列表(对照旧 100-103)。
 *
 * 需放置于带 `group` class 的卡片容器内:默认透明,hover 卡片时淡入。
 */
export default function CoverPlayButton({
  id,
  type = "playlist",
  size = 44,
  className = "",
}: CoverPlayButtonProps) {
  const [loading, setLoading] = useState(false);
  // 已拉取的歌单曲目缓存(对照旧 playListData,拉取一次后复用)
  const [listData, setListData] = useState<Song[] | null>(null);
  const playingId = useMusicStore((s) => s.playSongData?.id);
  const playState = useStatusStore((s) => s.playState);

  // 当前播放歌曲在本歌单内的索引(对照旧 isHasSongs;未拉取过数据时恒为 -1)
  const hasIndex = useMemo<number>(() => {
    if (!listData || playingId == null) return -1;
    return listData.findIndex((song) => song.id === playingId);
  }, [listData, playingId]);

  const showPause = hasIndex !== -1 && playState;

  /** 拉取歌单 / 专辑曲目并格式化(为了播放速度,歌单仅加载前 500 首) */
  const fetchSongs = async (): Promise<Song[] | null> => {
    if (id == null || id === "") return null;
    const result =
      type === "album" ? await api.getAlbumDetail(id) : await api.getAllPlayList(id, 500, 0);
    return formatData(result?.songs, "song");
  };

  const handleClick = async (e: MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    // 一起听房内禁用播放全部(对照旧 CoverPlayBtn playAllSongs 首个分支)
    if (useStatusStore.getState().isInRoom) {
      toast.warning("一起听歌模式下，不允许使用播放全部功能");
      return;
    }
    if (id == null || id === "") return;
    // 已处于当前歌单内:定位到当前歌曲并切换播放/暂停(对照旧「处于歌单内」分支)
    if (hasIndex !== -1 && listData) {
      useMusicStore.setState({ playSongData: listData[hasIndex] });
      useStatusStore.setState({ playIndex: hasIndex });
      await playOrPause();
      return;
    }
    try {
      setLoading(true);
      const songs = await fetchSongs();
      if (!songs?.length) {
        toast.error("获取播放列表时出现错误");
        return;
      }
      setListData(songs);
      // playAllSongs 内部对齐旧逻辑:关闭心动模式、整表替换、从第一首播放并提示
      await playAllSongs(songs, "normal");
    } catch (error) {
      console.error("获取播放列表时出现错误：", error);
      toast.error("获取播放列表时出现错误");
    } finally {
      setLoading(false);
    }
  };

  const iconSize = Math.round(size * 0.5);

  return (
    <button
      type="button"
      title={showPause ? "暂停" : "播放全部"}
      aria-label={showPause ? "暂停" : "播放全部"}
      onClick={(e) => void handleClick(e)}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{ width: size, height: size }}
      className={`flex items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-black/60 ${
        loading
          ? "opacity-100"
          : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
      } ${className}`}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin" aria-hidden="true" />
      ) : showPause ? (
        <Pause size={iconSize} fill="currentColor" aria-hidden="true" />
      ) : (
        <Play size={iconSize} fill="currentColor" aria-hidden="true" />
      )}
    </button>
  );
}
