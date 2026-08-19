import { addSongToNext, getSongTime, type Artist, type Song } from "@met/core";
import { useMusicStore } from "@/stores/music";

interface SongListProps {
  songs: Song[];
  loading?: boolean;
  onPlayAll?: () => void;
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

/** 可复用歌曲列表 */
export default function SongList({ songs, loading = false, onPlayAll }: SongListProps) {
  const playingId = useMusicStore((s) => s.playSongData?.id);

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
        {songs.map((song, index) => {
          const isPlaying = playingId != null && playingId === song.id;
          return (
            <li
              key={`${song.id}-${index}`}
              onDoubleClick={() => addSongToNext(song, true)}
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
                {index + 1}
              </span>
              {/* 封面缩略 */}
              {song.coverSize?.s ? (
                <img
                  src={song.coverSize.s}
                  alt=""
                  loading="lazy"
                  className="h-10 w-10 shrink-0 rounded-md bg-[var(--met-bg-elevated)] object-cover"
                />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-md bg-[var(--met-bg-elevated)]" />
              )}
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
              <div className="hidden w-1/4 min-w-0 truncate text-xs text-[var(--met-fg-dim)] sm:block">
                {albumText(song.album)}
              </div>
              {/* 时长 */}
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-[var(--met-fg-dim)]">
                {durationText(song.duration)}
              </span>
              {/* 行内播放按钮 */}
              <button
                type="button"
                aria-label={`播放 ${song.name}`}
                onClick={() => addSongToNext(song, true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--met-fg-dim)] opacity-0 transition-opacity hover:text-[var(--met-primary)] focus-visible:opacity-100 group-hover:opacity-100"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
