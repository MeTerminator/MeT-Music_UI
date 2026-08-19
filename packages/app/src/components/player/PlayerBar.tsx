import { useState } from "react";
import { changePlayIndex, playOrPause, setSeek, setVolume, setVolumeMute } from "@met/core";
import { useStatusStore, type StatusStoreState } from "../../stores/status";
import { useMusicStore } from "../../stores/music";
import { formatArtists, getCoverUrl } from "./format";

/** 播放模式循环顺序 */
const NEXT_SONG_MODE: Record<
  StatusStoreState["playSongMode"],
  StatusStoreState["playSongMode"]
> = {
  normal: "random",
  random: "repeat",
  repeat: "normal",
};

const SONG_MODE_META: Record<StatusStoreState["playSongMode"], { icon: string; label: string }> = {
  normal: { icon: "⇆", label: "列表循环" },
  random: { icon: "⤮", label: "随机播放" },
  repeat: { icon: "↺", label: "单曲循环" },
};

/**
 * 底部播放条(U2:功能完整、样式简洁)。
 * 由 RootLayout 放置于布局底部;自身高度 72px、宽度 100%。
 */
export default function PlayerBar() {
  const playState = useStatusStore((s) => s.playState);
  const playLoading = useStatusStore((s) => s.playLoading);
  const playTimeData = useStatusStore((s) => s.playTimeData);
  const playSongMode = useStatusStore((s) => s.playSongMode);
  const playVolume = useStatusStore((s) => s.playVolume);
  const playSongData = useMusicStore((s) => s.playSongData);

  /** 拖动中的进度值(0-100);null 表示未在拖动,由 playTimeData.bar 驱动 */
  const [dragBar, setDragBar] = useState<number | null>(null);

  const coverUrl = getCoverUrl(playSongData, "s");
  const artistsText = formatArtists(playSongData.artists);
  const modeMeta = SONG_MODE_META[playSongMode];
  const barValue = dragBar ?? (Number(playTimeData.bar) || 0);

  const commitSeek = (percent: number) => {
    const { duration } = useStatusStore.getState().playTimeData;
    setSeek((percent / 100) * duration);
    setDragBar(null);
  };

  return (
    <div
      className="flex h-[72px] w-full items-center gap-4 border-t px-4"
      style={{
        background: "var(--met-bg-elevated)",
        borderColor: "var(--met-border)",
      }}
    >
      {/* 左区:封面 + 歌曲信息,点击打开全屏播放器 */}
      <div
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
        role="button"
        tabIndex={0}
        title="打开播放器"
        onClick={() => useStatusStore.setState({ showFullPlayer: true })}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            useStatusStore.setState({ showFullPlayer: true });
          }
        }}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="封面"
            className="h-12 w-12 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div
            className="h-12 w-12 shrink-0 rounded-md"
            style={{ background: "var(--met-border)" }}
          />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm" style={{ color: "var(--met-fg)" }}>
            {playSongData.name || "未在播放"}
          </div>
          {artistsText && (
            <div className="truncate text-xs" style={{ color: "var(--met-fg-dim)" }}>
              {artistsText}
            </div>
          )}
        </div>
      </div>

      {/* 中区:控制按钮 + 进度条 */}
      <div className="flex w-[420px] max-w-[46%] flex-col items-center gap-1">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="cursor-pointer bg-transparent text-lg"
            style={{ color: "var(--met-fg)" }}
            title="上一曲"
            onClick={() => void changePlayIndex("prev", true)}
          >
            ⏮
          </button>
          <button
            type="button"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-lg"
            style={{ background: "var(--met-primary)", color: "var(--met-bg)" }}
            title={playState ? "暂停" : "播放"}
            onClick={() => void playOrPause()}
          >
            {playLoading ? (
              <span className="inline-block animate-spin">◌</span>
            ) : playState ? (
              "⏸"
            ) : (
              "▶"
            )}
          </button>
          <button
            type="button"
            className="cursor-pointer bg-transparent text-lg"
            style={{ color: "var(--met-fg)" }}
            title="下一曲"
            onClick={() => void changePlayIndex("next", true)}
          >
            ⏭
          </button>
        </div>
        <div className="flex w-full items-center gap-2">
          <span
            className="w-10 shrink-0 text-right text-xs tabular-nums"
            style={{ color: "var(--met-fg-dim)" }}
          >
            {playTimeData.played}
          </span>
          <input
            type="range"
            className="w-full cursor-pointer"
            style={{ accentColor: "var(--met-primary)" }}
            min={0}
            max={100}
            step={0.1}
            value={barValue}
            aria-label="播放进度"
            onChange={(e) => setDragBar(Number(e.target.value))}
            onPointerUp={(e) => commitSeek(Number(e.currentTarget.value))}
            onKeyUp={(e) => {
              if (dragBar !== null) commitSeek(Number(e.currentTarget.value));
            }}
          />
          <span
            className="w-10 shrink-0 text-xs tabular-nums"
            style={{ color: "var(--met-fg-dim)" }}
          >
            {playTimeData.durationTime}
          </span>
        </div>
      </div>

      {/* 右区:播放模式 + 音量 */}
      <div className="flex flex-1 items-center justify-end gap-3">
        <button
          type="button"
          className="cursor-pointer bg-transparent text-lg"
          style={{ color: "var(--met-fg)" }}
          title={modeMeta.label}
          onClick={() => useStatusStore.setState({ playSongMode: NEXT_SONG_MODE[playSongMode] })}
        >
          {modeMeta.icon}
        </button>
        <button
          type="button"
          className="cursor-pointer bg-transparent text-lg"
          style={{ color: "var(--met-fg)" }}
          title={playVolume > 0 ? "静音" : "取消静音"}
          onClick={() => setVolumeMute()}
        >
          {playVolume > 0 ? "🔊" : "🔇"}
        </button>
        <input
          type="range"
          className="w-24 cursor-pointer"
          style={{ accentColor: "var(--met-primary)" }}
          min={0}
          max={1}
          step={0.01}
          value={playVolume}
          aria-label="音量"
          onChange={(e) => {
            const v = Number(e.target.value);
            useStatusStore.setState({ playVolume: v });
            setVolume(v);
          }}
        />
      </div>
    </div>
  );
}
