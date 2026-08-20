import { useEffect, useRef } from "react";
import { Music, X } from "lucide-react";
import { toast } from "sonner";
import { fadePlayOrPause, initPlayer, soundStop, type Song } from "@met/core";
import { useStatusStore } from "../../stores/status";
import { useMusicStore } from "../../stores/music";
import { useSettingsStore } from "../../stores/settings";
import {
  playIndexAction as ltPlayIndex,
  removeSong as ltRemoveSong,
  reorderPlaylist as ltReorderPlaylist,
} from "../../stores/listenTogether";
import { formatArtists } from "./format";

/**
 * 播放列表抽屉(U3)。对照旧 src/components/Global/Playlist.vue:
 * 右侧滑出面板,受 status.playListShow 控制,遮罩点击关闭;
 * 行点击定位播放、行内删除、清空列表。
 * 一起听房内:music.playList 即共享列表镜像(listenTogether.syncPlayerState 写入),
 * 操作全部转发共享列表(行点击→playIndexAction,删除→removeSong,清空→reorderPlaylist([]))。
 */
export default function PlaylistDrawer() {
  const playListShow = useStatusStore((s) => s.playListShow);
  const playIndex = useStatusStore((s) => s.playIndex);
  const isInRoom = useStatusStore((s) => s.isInRoom);
  const playList = useMusicStore((s) => s.playList);
  const playSongData = useMusicStore((s) => s.playSongData);

  const listRef = useRef<HTMLDivElement | null>(null);

  const close = () => useStatusStore.setState({ playListShow: false });

  // Esc 关闭(对齐旧 n-drawer 行为)
  useEffect(() => {
    if (!playListShow) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // 全屏播放器打开时让 Esc 先关闭播放器,避免一次按键双关(见 FullPlayer 的 Esc 处理)
      if (useStatusStore.getState().showFullPlayer) return;
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playListShow]);

  // 打开时滚动到当前播放行(对齐旧 playlistOpen)
  useEffect(() => {
    if (!playListShow) return;
    const timer = window.setTimeout(() => {
      const el = listRef.current?.querySelector(`[data-index="${playIndex}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [playListShow, playIndex]);

  /** 行点击 = 定位播放(对齐旧 Playlist.vue 的 playSong) */
  const playSong = (song: Song, index: number) => {
    const status = useStatusStore.getState();
    const settings = useSettingsStore.getState();
    // 若开启了缓存且正在加载
    if (settings.useMusicCache && status.playLoading) {
      toast.warning("歌曲正在缓冲中,请稍后");
      return;
    }
    // 房内:同曲切换播放/暂停,否则请求房间跳播共享列表索引(对齐旧 isInRoom 分支)
    if (status.isInRoom) {
      if (playSongData?.id === song?.id) {
        fadePlayOrPause();
      } else {
        ltPlayIndex(index);
      }
      return;
    }
    // 更改模式(旧逻辑:非电台时回到 normal)
    if (status.playMode !== "dj") {
      useStatusStore.setState({ playMode: "normal" });
    }
    // 更改播放索引
    useStatusStore.setState({ playIndex: index });
    // 是否为当前播放歌曲
    if (playSongData?.id === song?.id) {
      // 继续播放 / 暂停切换
      fadePlayOrPause();
    } else {
      useMusicStore.setState({ playSongData: song });
      // 初始化播放器
      void initPlayer(true);
    }
  };

  /** 清空列表(对齐旧 cleanPlaylists;房内转发共享列表清空 reorderPlaylist([])) */
  const cleanPlaylists = () => {
    const status = useStatusStore.getState();
    if (status.isInRoom) {
      ltReorderPlaylist([]);
      return;
    }
    soundStop();
    useStatusStore.setState({ playIndex: 0, playListShow: false, showFullPlayer: false });
    useMusicStore.setState({ playList: [], playSongData: {} as Song });
    toast.success("已清空播放列表");
  };

  /** 移除单曲(对齐旧 removeSong,改为不可变更新;房内转发共享列表删除) */
  const removeSong = (index: number) => {
    const status = useStatusStore.getState();
    if (status.isInRoom) {
      ltRemoveSong(index);
      return;
    }
    // 若删除时仅剩一首
    if (playList.length === 1) {
      cleanPlaylists();
      return;
    }
    const next = playList.filter((_, i) => i !== index);
    // 若为当前播放:原位顶上下一首(删除末尾曲则退到新末尾),
    // 不走 changePlayIndex("next")——那会基于已过期索引再前进一位
    if (index === status.playIndex) {
      const newIndex = Math.min(index, next.length - 1);
      useStatusStore.setState({ playIndex: newIndex });
      useMusicStore.setState({ playList: next, playSongData: next[newIndex] });
      void initPlayer(true);
    }
    // 若为当前播放之前
    else if (index < status.playIndex) {
      useStatusStore.setState({ playIndex: status.playIndex - 1 });
      useMusicStore.setState({ playList: next });
    }
    // 若大于当前播放
    else {
      useMusicStore.setState({ playList: next });
    }
  };

  return (
    <>
      {/* 遮罩 */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          playListShow ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden="true"
        onClick={close}
      />
      {/* 抽屉面板 */}
      <aside
        className={`fixed inset-y-0 right-0 z-30 flex w-[380px] max-w-[92vw] flex-col border-l transition-transform duration-300 ${
          playListShow ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          background: "var(--met-bg-elevated)",
          borderColor: "var(--met-border)",
        }}
        role="dialog"
        aria-label="播放列表"
        aria-hidden={!playListShow}
      >
        {/* 标题栏 */}
        <div
          className="flex h-14 shrink-0 items-center justify-between border-b px-4"
          style={{ borderColor: "var(--met-border)" }}
        >
          <div className="text-sm font-bold" style={{ color: "var(--met-fg)" }}>
            {isInRoom ? "一起听列表" : "播放列表"} ({playList.length})
          </div>
          <button
            type="button"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-transparent transition-colors hover:bg-[var(--met-bg-hover)]"
            style={{ color: "var(--met-fg-dim)" }}
            title="关闭"
            onClick={close}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* 歌曲列表 */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-3">
          {playList.length ? (
            playList.map((item, index) => {
              const isCurrent = index === playIndex;
              return (
                <div
                  key={`${item.id}-${index}`}
                  data-index={index}
                  className="group mb-2 flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors"
                  style={{
                    background: isCurrent ? "var(--met-bg-hover)" : "transparent",
                    borderColor: isCurrent ? "var(--met-primary)" : "transparent",
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => playSong(item, index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      playSong(item, index);
                    }
                  }}
                >
                  {/* 序号 / 播放标记 */}
                  <span
                    className="flex w-7 shrink-0 items-center justify-center text-center text-xs tabular-nums"
                    style={{ color: isCurrent ? "var(--met-primary)" : "var(--met-fg-dim)" }}
                  >
                    {isCurrent ? <Music size={16} aria-label="正在播放" /> : index + 1}
                  </span>
                  {/* 信息 */}
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-sm"
                      style={{ color: isCurrent ? "var(--met-primary)" : "var(--met-fg)" }}
                    >
                      {item.name || "未知曲目"}
                    </div>
                    <div className="truncate text-xs" style={{ color: "var(--met-fg-dim)" }}>
                      {formatArtists(item.artists) || "未知艺术家"}
                    </div>
                  </div>
                  {/* 删除 */}
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer rounded-md bg-transparent px-1.5 py-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--met-bg-hover)]"
                    style={{ color: "var(--met-fg-dim)" }}
                    title="从列表中移除"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSong(index);
                    }}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              );
            })
          ) : (
            <div
              className="mt-16 text-center text-sm"
              style={{ color: "var(--met-fg-dim)" }}
            >
              播放列表暂无歌曲,快去添加吧
            </div>
          )}
        </div>

        {/* 底部操作 */}
        {playList.length > 0 && (
          <div
            className="flex shrink-0 gap-3 border-t p-3"
            style={{ borderColor: "var(--met-border)" }}
          >
            <button
              type="button"
              className="h-9 flex-1 cursor-pointer rounded-lg border bg-transparent text-sm transition-colors hover:bg-[var(--met-bg-hover)]"
              style={{ borderColor: "var(--met-border)", color: "var(--met-fg)" }}
              onClick={() => {
                const el = listRef.current?.querySelector(
                  `[data-index="${useStatusStore.getState().playIndex}"]`,
                );
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              当前播放
            </button>
            <button
              type="button"
              className="h-9 flex-1 cursor-pointer rounded-lg border bg-transparent text-sm transition-colors hover:bg-[var(--met-bg-hover)]"
              style={{ borderColor: "var(--met-border)", color: "var(--met-danger)" }}
              onClick={cleanPlaylists}
            >
              清空列表
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
