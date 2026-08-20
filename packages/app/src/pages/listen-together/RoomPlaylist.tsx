import {
  playIndexAction,
  removeSong,
  reorderPlaylist,
  useListenTogetherStore,
} from "@/stores/listenTogether";
import { fallbackImg, formatArtist, songCover } from "./shared";

/**
 * 共享播放列表(对应旧页 .playlist-panel):
 * 当前曲目高亮,行操作:播放该曲 / 上移 / 下移 / 移除。
 * 排序采用上移/下移按钮(旧页为拖拽,此处为简化实现,最终仍走 reorderPlaylist)。
 */
const RoomPlaylist = () => {
  const roomState = useListenTogetherStore((s) => s.roomState);
  const { playlist, current_song_index: currentIndex } = roomState;

  /** 上移/下移(生成新数组后整体提交 reorderPlaylist) */
  const moveSong = (from: number, to: number): void => {
    if (to < 0 || to >= playlist.length || from === to) return;
    const copy = [...playlist];
    const [item] = copy.splice(from, 1);
    if (!item) return;
    copy.splice(to, 0, item);
    reorderPlaylist(copy);
  };

  return (
    <div className="flex flex-col rounded-xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)]">
      <div className="border-b border-[var(--met-border)] px-5 py-3.5 text-base font-semibold text-[var(--met-fg)]">
        共享播放列表
        <span className="ml-2 text-xs font-normal text-[var(--met-fg-dim)]">
          共 {playlist.length} 首
        </span>
      </div>

      {playlist.length === 0 ? (
        <div className="px-5 py-16 text-center text-sm text-[var(--met-fg-dim)]">
          当前播放队列中没有歌曲。可在下方搜索点歌，或在应用中右键歌曲“添加到一起听歌”。
        </div>
      ) : (
        <ul className="flex max-h-[calc(100vh-330px)] min-h-40 flex-col gap-1.5 overflow-y-auto p-3">
          {playlist.map((song, idx) => {
            const isActive = idx === currentIndex;
            return (
              <li
                key={`${song.id}-${idx}`}
                className={`group flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                  isActive
                    ? "border-[var(--met-primary)]/50 bg-[var(--met-primary)]/10"
                    : "border-transparent hover:bg-[var(--met-bg-hover)]"
                }`}
              >
                {/* 序号 / 播放中标记 */}
                <span
                  className={`w-6 shrink-0 text-center text-xs font-bold ${
                    isActive ? "animate-pulse text-[var(--met-primary)]" : "text-[var(--met-fg-dim)]"
                  }`}
                >
                  {isActive ? "♪" : idx + 1}
                </span>

                <img
                  src={songCover(song)}
                  alt=""
                  loading="lazy"
                  onError={fallbackImg("/images/pic/song.jpg")}
                  className="h-9 w-9 shrink-0 rounded-md border border-[var(--met-border)] object-cover"
                />

                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-sm ${
                      isActive ? "font-bold text-[var(--met-primary)]" : "text-[var(--met-fg)]"
                    }`}
                  >
                    {song.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="truncate text-xs text-[var(--met-fg-dim)]">
                      {formatArtist(song.artists)}
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--met-bg-hover)] px-1.5 py-px text-[10px] text-[var(--met-fg-dim)]">
                      {String((song as Record<string, unknown>).added_by ?? "") || "系统"}
                    </span>
                  </div>
                </div>

                {/* 行操作:hover 展示 */}
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    title="播放这首"
                    onClick={() => playIndexAction(idx)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[var(--met-primary)] hover:bg-[var(--met-primary)]/15"
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    title="上移"
                    disabled={idx === 0}
                    onClick={() => moveSong(idx, idx - 1)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[var(--met-fg-dim)] hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-fg)] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    title="下移"
                    disabled={idx === playlist.length - 1}
                    onClick={() => moveSong(idx, idx + 1)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[var(--met-fg-dim)] hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-fg)] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    title="从队列移除"
                    onClick={() => removeSong(idx)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[var(--met-danger)] hover:bg-[var(--met-danger)]/15"
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default RoomPlaylist;
