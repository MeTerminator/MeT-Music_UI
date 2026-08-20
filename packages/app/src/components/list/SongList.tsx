import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Ellipsis, ListEnd, Play } from "lucide-react";
import { toast } from "sonner";
import {
  addSongToNext,
  fadePlayOrPause,
  fuzzySearch,
  getSongTime,
  initPlayer,
  type Song,
} from "@met/core";
import { copyText } from "@/lib/clipboard";
import { formatArtists } from "@/lib/format";
import { useMusicStore } from "@/stores/music";
import { useStatusStore } from "@/stores/status";
import { addSong as ltAddSong } from "@/stores/listenTogether";
import { ContextMenu } from "@/components/ui/context-menu";
import { DropdownMenu, type MenuItemDef } from "@/components/ui/menu";

interface SongListProps {
  songs: Song[];
  loading?: boolean;
  onPlayAll?: () => void;
  /** 是否显示专辑列(默认 true;专辑页内可关闭) */
  showAlbum?: boolean;
  /** 是否显示封面缩略图(默认 true) */
  showCover?: boolean;
  /** 序号偏移(分页时传 (page-1)*pageSize,仅影响序号展示) */
  indexOffset?: number;
  /** 模糊搜索关键词(fuzzySearch 本地过滤,空串/空白视为不过滤) */
  filterKeyword?: string;
  /** 列表触底回调(IntersectionObserver 哨兵,预留分页加载) */
  onReachEnd?: () => void;
}

/** 歌手展示文本(空值兜底「未知歌手」) */
const artistsText = (artists: Song["artists"]): string =>
  formatArtists(artists) || "未知歌手";

/** 专辑展示文本(album 可能是对象或字符串) */
const albumText = (album: Song["album"]): string => {
  if (!album) return "未知专辑";
  return typeof album === "string" ? album : (album.name ?? "未知专辑");
};

/** 时长展示文本(duration 通常已是 "mm:ss",若为毫秒数则格式化) */
const durationText = (duration: Song["duration"]): string => {
  if (typeof duration === "number") return getSongTime(duration);
  return duration || "--:--";
};

/** 复制歌曲分享链接(对照旧 SongListDropdown 的「分享歌曲链接」) */
const copySongLink = (song: Song): Promise<void> =>
  copyText(`https://y.qq.com/n/ryqq/songDetail/${String(song.id)}`, "复制歌曲链接成功");

/** 歌曲 MV id(formatData 的 song.mv 字段;0 / "0" / 空值视为无 MV) */
const getMvId = (song: Song): string | null => {
  const mv = (song as { mv?: unknown }).mv;
  if (typeof mv === "number" && mv !== 0) return String(mv);
  if (typeof mv === "string" && mv !== "" && mv !== "0") return mv;
  return null;
};

/**
 * 列表定位播放(对照旧 SongList.vue 的 playSong 双击逻辑):
 * 整表设为播放列表,并从被点击行开始播放;再次操作当前播放行则切换播放/暂停。
 * 一起听房内(对齐旧 isInRoom 分支):不动本地播放列表,改为添加到共享队列。
 */
const playFromList = async (list: Song[], song: Song, index: number): Promise<void> => {
  const playingId = useMusicStore.getState().playSongData?.id;
  if (playingId != null && playingId === song.id) {
    // 与旧实现一致:双击当前播放歌曲 → 播放/暂停切换(房内同样走此分支)
    fadePlayOrPause();
    return;
  }
  if (useStatusStore.getState().isInRoom) {
    ltAddSong(song);
    return;
  }
  useStatusStore.setState({ playMode: "normal", playIndex: index });
  useMusicStore.setState({ playList: list.slice(), playSongData: song });
  await initPlayer(true);
};

/** 下一首播放(房内改为添加到一起听队列,对齐「房内一切歌曲操作入共享清单」语义) */
const addNext = (song: Song): void => {
  if (useStatusStore.getState().isInRoom) {
    ltAddSong(song);
    return;
  }
  useStatusStore.setState({ playMode: "normal" });
  addSongToNext(song);
};

/** 可复用歌曲列表 */
export default function SongList({
  songs,
  loading = false,
  onPlayAll,
  showAlbum = true,
  showCover = true,
  indexOffset = 0,
  filterKeyword,
  onReachEnd,
}: SongListProps) {
  const playingId = useMusicStore((s) => s.playSongData?.id);
  const isInRoom = useStatusStore((s) => s.isInRoom);
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const reachEndRef = useRef<SongListProps["onReachEnd"]>(onReachEnd);
  reachEndRef.current = onReachEnd;

  // 模糊搜索过滤(仅影响展示与定位播放的列表范围)
  const keyword = filterKeyword?.trim() ?? "";
  const displaySongs = useMemo<Song[]>(
    () => (keyword ? fuzzySearch(keyword, songs) : songs),
    [keyword, songs],
  );

  /**
   * 行操作菜单项(右键菜单与窄屏「⋯」按钮共用;对照旧 SongListDropdown 选项)。
   * 本地歌曲(song.path 存在)无线上 id,隐藏评论/详情/下载/复制链接。
   */
  const rowMenuItems = (song: Song, index: number): MenuItemDef[] => {
    const isLocalSong = !!song.path;
    const songId = String(song.id);
    const mvId = getMvId(song);
    const items: MenuItemDef[] = [
      {
        key: "play",
        label: "立即播放",
        onSelect: () => void playFromList(displaySongs, song, index),
      },
      {
        key: "next-play",
        label: "下一首播放",
        // 对照旧逻辑:当前播放歌曲不可再「下一首播放」;房内改为添加到一起听队列
        disabled: playingId != null && playingId === song.id,
        onSelect: () => addNext(song),
      },
    ];
    // 房内显式项(对照旧 SongListDropdown 的「添加到一起听歌」;不在房内隐藏)
    if (isInRoom) {
      items.push({
        key: "add-listen-together",
        label: "添加到一起听",
        onSelect: () => ltAddSong(song),
      });
    }
    if (mvId && !isLocalSong) {
      items.push({
        key: "mv",
        label: "观看 MV",
        onSelect: () => void navigate({ to: "/videos-player", search: { id: mvId } }),
      });
    }
    if (!isLocalSong) {
      items.push(
        {
          key: "comment",
          label: "查看评论",
          onSelect: () => void navigate({ to: "/comments", search: { id: songId } }),
        },
        {
          key: "song-detail",
          label: "查看单曲详情",
          onSelect: () => void navigate({ to: "/song", search: { id: songId } }),
        },
        {
          key: "download",
          label: "下载歌曲",
          onSelect: () => void navigate({ to: "/download", search: { id: songId } }),
        },
        {
          key: "share",
          label: "复制歌曲链接",
          onSelect: () => void copySongLink(song),
        },
      );
    }
    return items;
  };

  // 触底回调(预留分页)
  useEffect(() => {
    if (!onReachEnd || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) reachEndRef.current?.();
      },
      { rootMargin: "120px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onReachEnd, displaySongs.length]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 py-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="flex h-14 animate-pulse items-center gap-3 rounded-lg bg-[var(--met-bg-elevated)] px-3"
          >
            <div className="h-10 w-10 rounded-md bg-[var(--met-border)]" />
            <div className="flex-1">
              <div className="mb-2 h-3 w-1/3 rounded bg-[var(--met-border)]" />
              <div className="h-2.5 w-1/5 rounded bg-[var(--met-border)]" />
            </div>
          </div>
        ))}
        <div className="py-2 text-center text-sm text-[var(--met-fg-dim)]">加载中…</div>
      </div>
    );
  }

  if (!songs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--met-fg-dim)]">
        <span className="text-sm">暂无歌曲</span>
      </div>
    );
  }

  if (keyword && !displaySongs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--met-fg-dim)]">
        <span className="text-sm">搜不到关于「{keyword}」的任何歌曲呀</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {onPlayAll ? (
        <div className="flex items-center gap-3 py-3">
          <button
            type="button"
            onClick={() => {
              // 房内禁止整表替换播放列表(engine.playAllSongs 已拒绝,此处显式提示)
              if (useStatusStore.getState().isInRoom) {
                toast.warning("一起听房间内暂不支持播放全部,请单曲添加到一起听队列");
                return;
              }
              onPlayAll();
            }}
            className="flex items-center gap-1.5 rounded-full bg-[var(--met-primary)] px-4 py-1.5 text-sm font-medium text-[var(--met-bg)] transition-opacity hover:opacity-90"
          >
            <Play size={16} fill="currentColor" aria-hidden="true" />
            播放全部
          </button>
          <span className="text-xs text-[var(--met-fg-dim)]">共 {songs.length} 首</span>
        </div>
      ) : null}

      <ul className="flex flex-col">
        {displaySongs.map((song, index) => {
          const isPlaying = playingId != null && playingId === song.id;
          const menuItems = rowMenuItems(song, index);
          const mvId = getMvId(song);
          return (
            <ContextMenu
              key={`${song.id}-${index}`}
              items={menuItems}
              render={
                <li
                  onDoubleClick={() => void playFromList(displaySongs, song, index)}
                  className={`group flex select-none items-center gap-3 rounded-lg border border-transparent px-3 py-2 transition-colors hover:bg-[var(--met-bg-elevated)] ${
                    isPlaying ? "border-[var(--met-border)] bg-[var(--met-bg-elevated)]" : ""
                  }`}
                />
              }
            >
              {/* 序号 */}
              <span
                className={`w-8 shrink-0 text-center text-sm tabular-nums ${
                  isPlaying ? "text-[var(--met-primary)]" : "text-[var(--met-fg-dim)]"
                }`}
              >
                {indexOffset + index + 1}
              </span>
              {/* 封面缩略 */}
              {showCover ? (
                song.coverSize?.s ? (
                  <img
                    src={song.coverSize.s}
                    alt=""
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded-md bg-[var(--met-bg-elevated)] object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-md bg-[var(--met-bg-elevated)]" />
                )
              ) : null}
              {/* 歌名 / 歌手 */}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <div
                    className={`truncate text-sm ${
                      isPlaying ? "text-[var(--met-primary)]" : "text-[var(--met-fg)]"
                    }`}
                    title={song.name}
                  >
                    {song.name}
                  </div>
                  {/* MV 标签(对照旧 SongList 的 MV tag,点击跳转视频播放页) */}
                  {mvId ? (
                    <button
                      type="button"
                      title="观看 MV"
                      className="shrink-0 cursor-pointer rounded-full border border-[var(--met-primary)] px-1.5 text-[10px] leading-4 text-[var(--met-primary)] transition-colors hover:bg-[var(--met-bg-hover)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        void navigate({ to: "/videos-player", search: { id: mvId } });
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      MV
                    </button>
                  ) : null}
                </div>
                <div className="truncate text-xs text-[var(--met-fg-dim)]">
                  {artistsText(song.artists)}
                </div>
              </div>
              {/* 专辑 */}
              {showAlbum ? (
                <div className="hidden w-1/4 min-w-0 truncate text-xs text-[var(--met-fg-dim)] sm:block">
                  {albumText(song.album)}
                </div>
              ) : null}
              {/* 悬停操作:立即播放 / 下一首播放(窄屏隐藏,由行尾「⋯」菜单承接) */}
              <div className="hidden shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 md:flex">
                <button
                  type="button"
                  aria-label={isInRoom ? `添加到一起听 ${song.name}` : `播放 ${song.name}`}
                  title={isInRoom ? "添加到一起听" : "立即播放"}
                  onClick={() => void playFromList(displaySongs, song, index)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)]"
                >
                  <Play size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={
                    isInRoom ? `添加到一起听 ${song.name}` : `下一首播放 ${song.name}`
                  }
                  title={isInRoom ? "添加到一起听" : "下一首播放"}
                  onClick={() => addNext(song)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)]"
                >
                  <ListEnd size={18} aria-hidden="true" />
                </button>
              </div>
              {/* 时长 */}
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-[var(--met-fg-dim)]">
                {durationText(song.duration)}
              </span>
              {/* 窄屏「⋯」菜单(<768px 无右键场景;与右键菜单同组操作) */}
              <DropdownMenu
                items={menuItems}
                side="bottom"
                align="end"
                ariaLabel={`${song.name} 更多操作`}
                title="更多操作"
                triggerClassName="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-transparent text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)] md:hidden"
              >
                <Ellipsis size={18} aria-hidden="true" />
              </DropdownMenu>
            </ContextMenu>
          );
        })}
      </ul>

      {/* 触底哨兵 */}
      {onReachEnd ? <div ref={sentinelRef} className="h-px w-full" /> : null}
    </div>
  );
}
