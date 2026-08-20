import { useEffect, useMemo, useRef } from "react";
import {
  addSongToNext,
  fadePlayOrPause,
  fuzzySearch,
  getSongTime,
  initPlayer,
  type Artist,
  type Song,
} from "@met/core";
import { useMusicStore } from "@/stores/music";
import { useStatusStore } from "@/stores/status";

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

/** 歌手展示文本(artists 可能是数组或字符串) */
const artistsText = (artists: Song["artists"]): string => {
  if (!artists) return "未知歌手";
  if (typeof artists === "string") return artists;
  return artists.map((a: Artist) => a?.name).filter(Boolean).join(" / ") || "未知歌手";
};

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

/**
 * 列表定位播放(对照旧 SongList.vue 的 playSong 双击逻辑):
 * 整表设为播放列表,并从被点击行开始播放;再次操作当前播放行则切换播放/暂停。
 */
const playFromList = async (list: Song[], song: Song, index: number): Promise<void> => {
  const playingId = useMusicStore.getState().playSongData?.id;
  if (playingId != null && playingId === song.id) {
    // 与旧实现一致:双击当前播放歌曲 → 播放/暂停切换
    fadePlayOrPause();
    return;
  }
  useStatusStore.setState({ playMode: "normal", playIndex: index });
  useMusicStore.setState({ playList: list.slice(), playSongData: song });
  await initPlayer(true);
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
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const reachEndRef = useRef<SongListProps["onReachEnd"]>(onReachEnd);
  reachEndRef.current = onReachEnd;

  // 模糊搜索过滤(仅影响展示与定位播放的列表范围)
  const keyword = filterKeyword?.trim() ?? "";
  const displaySongs = useMemo<Song[]>(
    () => (keyword ? fuzzySearch(keyword, songs) : songs),
    [keyword, songs],
  );

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
            onClick={onPlayAll}
            className="flex items-center gap-1.5 rounded-full bg-[var(--met-primary)] px-4 py-1.5 text-sm font-medium text-[var(--met-bg)] transition-opacity hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            播放全部
          </button>
          <span className="text-xs text-[var(--met-fg-dim)]">共 {songs.length} 首</span>
        </div>
      ) : null}

      <ul className="flex flex-col">
        {displaySongs.map((song, index) => {
          const isPlaying = playingId != null && playingId === song.id;
          return (
            <li
              key={`${song.id}-${index}`}
              onDoubleClick={() => void playFromList(displaySongs, song, index)}
              className={`group flex select-none items-center gap-3 rounded-lg border border-transparent px-3 py-2 transition-colors hover:bg-[var(--met-bg-elevated)] ${
                isPlaying ? "border-[var(--met-border)] bg-[var(--met-bg-elevated)]" : ""
              }`}
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
                <div
                  className={`truncate text-sm ${
                    isPlaying ? "text-[var(--met-primary)]" : "text-[var(--met-fg)]"
                  }`}
                  title={song.name}
                >
                  {song.name}
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
              {/* 悬停操作:立即播放 / 下一首播放 */}
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  aria-label={`播放 ${song.name}`}
                  title="立即播放"
                  onClick={() => void playFromList(displaySongs, song, index)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)]"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label={`下一首播放 ${song.name}`}
                  title="下一首播放"
                  onClick={() => addSongToNext(song)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)]"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                    <path d="M3 6h12v2H3V6zm0 4h12v2H3v-2zm0 4h8v2H3v-2zm14-4h2v3h3v2h-3v3h-2v-3h-3v-2h3v-3z" />
                  </svg>
                </button>
              </div>
              {/* 时长 */}
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-[var(--met-fg-dim)]">
                {durationText(song.duration)}
              </span>
            </li>
          );
        })}
      </ul>

      {/* 触底哨兵 */}
      {onReachEnd ? <div ref={sentinelRef} className="h-px w-full" /> : null}
    </div>
  );
}
