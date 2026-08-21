import { useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical, Music, Play, X } from "lucide-react";
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
 * 排序支持拖拽手柄拖放(对照旧 handleDragStart/handleDrop,HTML5 DnD),
 * 同时保留上移/下移按钮,最终均走 reorderPlaylist(新序)。
 */
const RoomPlaylist = () => {
  const roomState = useListenTogetherStore((s) => s.roomState);
  const { playlist, current_song_index: currentIndex } = roomState;

  // ===== 拖拽排序状态(对照旧 draggedItemIndex) =====
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  /** 上移/下移(生成新数组后整体提交 reorderPlaylist) */
  const moveSong = (from: number, to: number): void => {
    if (to < 0 || to >= playlist.length || from === to) return;
    const copy = [...playlist];
    const [item] = copy.splice(from, 1);
    if (!item) return;
    copy.splice(to, 0, item);
    reorderPlaylist(copy);
  };

  /** 手柄拖起(对照旧 handleDragStart:记录起点 + 整行作为拖拽影子图像) */
  const handleDragStart = (index: number, e: DragEvent<HTMLDivElement>): void => {
    setDraggedIndex(index);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
      // 用整行作为拖拽时显示的影子图像,提升拖拽手感并避免文本选择冲突
      const dragItem = e.currentTarget.closest("li");
      if (dragItem) {
        e.dataTransfer.setDragImage(dragItem, 20, 20);
      }
    }
  };

  /** 拖拽结束(未落点也要清理状态,对照旧 handleDragEnd) */
  const handleDragEnd = (): void => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  /** 拖过目标行:允许落点并高亮 */
  const handleDragOver = (index: number, e: DragEvent<HTMLLIElement>): void => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (index !== dragOverIndex) setDragOverIndex(index);
  };

  /** 落点重排(对照旧 handleDrop:优先状态,回退 dataTransfer;新序整体提交) */
  const handleDrop = (dropIndex: number, e: DragEvent<HTMLLIElement>): void => {
    e.preventDefault();
    let startIndex: number | null = draggedIndex;
    if (startIndex === null && e.dataTransfer) {
      const data = e.dataTransfer.getData("text/plain");
      if (data !== "") startIndex = Number.parseInt(data, 10);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
    if (startIndex === null || Number.isNaN(startIndex) || startIndex === dropIndex) return;

    const copy = [...playlist];
    const [item] = copy.splice(startIndex, 1);
    if (!item) return;
    copy.splice(dropIndex, 0, item);
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
        <ul
          className="flex max-h-[calc(100vh-330px)] min-h-40 flex-col gap-1.5 overflow-y-auto p-3"
          onDragEnter={(e) => e.preventDefault()}
        >
          {playlist.map((song, idx) => {
            const isActive = idx === currentIndex;
            const isDragging = idx === draggedIndex;
            const isDropTarget =
              idx === dragOverIndex && draggedIndex !== null && idx !== draggedIndex;
            return (
              <li
                key={`${song.id}-${idx}`}
                className={`group flex items-center gap-2 rounded-lg border px-2 py-2 transition-colors ${
                  isActive
                    ? "border-[var(--met-primary)]/50 bg-[var(--met-primary)]/10"
                    : "border-transparent hover:bg-[var(--met-bg-hover)]"
                } ${isDragging ? "opacity-40" : ""} ${
                  isDropTarget ? "ring-2 ring-inset ring-[var(--met-primary)]/50" : ""
                }`}
                onDragOver={(e) => handleDragOver(idx, e)}
                onDragEnter={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(idx, e)}
              >
                {/* 拖拽手柄(对照旧 .drag-handle) */}
                <div
                  draggable
                  title="拖拽排序"
                  onDragStart={(e) => handleDragStart(idx, e)}
                  onDragEnd={handleDragEnd}
                  className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-[var(--met-fg-dim)] opacity-40 transition-opacity hover:opacity-100 active:cursor-grabbing"
                >
                  <GripVertical size={15} aria-hidden="true" />
                </div>

                {/* 序号 / 播放中标记 */}
                <span
                  className={`w-6 shrink-0 text-center text-xs font-bold ${
                    isActive ? "animate-pulse text-[var(--met-primary)]" : "text-[var(--met-fg-dim)]"
                  }`}
                >
                  {isActive ? (
                    <Music size={14} className="inline-block" aria-hidden="true" />
                  ) : (
                    idx + 1
                  )}
                </span>

                <img
                  src={songCover(song)}
                  alt=""
                  loading="lazy"
                  draggable={false}
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
                    <Play size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="上移"
                    disabled={idx === 0}
                    onClick={() => moveSong(idx, idx - 1)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[var(--met-fg-dim)] hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-fg)] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="下移"
                    disabled={idx === playlist.length - 1}
                    onClick={() => moveSong(idx, idx + 1)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[var(--met-fg-dim)] hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-fg)] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="从队列移除"
                    onClick={() => removeSong(idx)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[var(--met-danger)] hover:bg-[var(--met-danger)]/15"
                  >
                    <X size={16} aria-hidden="true" />
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
