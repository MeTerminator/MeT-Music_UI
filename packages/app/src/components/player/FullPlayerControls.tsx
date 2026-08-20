import { useState } from "react";
import { changePlayIndex, playOrPause, setSeek, setVolume, setVolumeMute } from "@met/core";
import { useStatusStore, type StatusStoreState } from "../../stores/status";
import { Slider } from "../ui/slider";

/** 播放模式循环顺序(与 PlayerBar 保持一致) */
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

export interface FullPlayerControlsProps {
  /** 悬停控制条时保持其可见(清除父级 2 秒隐藏计时器) */
  onKeepVisible: () => void;
}

/**
 * 全屏播放器底部悬浮控制条(对齐旧 PlayerControl.vue):
 * 进度 Slider + 上一曲/播放暂停/下一曲 + 播放模式 + 音量 + 关闭。
 * 随 status.playerControlShow 淡入淡出(鼠标静止 2 秒后由 FullPlayer 隐藏)。
 */
export default function FullPlayerControls({ onKeepVisible }: FullPlayerControlsProps) {
  const playerControlShow = useStatusStore((s) => s.playerControlShow);
  const playState = useStatusStore((s) => s.playState);
  const playLoading = useStatusStore((s) => s.playLoading);
  const playTimeData = useStatusStore((s) => s.playTimeData);
  const playSongMode = useStatusStore((s) => s.playSongMode);
  const playVolume = useStatusStore((s) => s.playVolume);

  /** 拖动中的进度(0-100);null 表示未拖动,由 playTimeData.bar 驱动 */
  const [dragBar, setDragBar] = useState<number | null>(null);
  const barValue = dragBar ?? (Number(playTimeData.bar) || 0);
  const modeMeta = SONG_MODE_META[playSongMode];

  const commitSeek = (percent: number) => {
    const { duration } = useStatusStore.getState().playTimeData;
    if (duration) setSeek((percent / 100) * duration);
    setDragBar(null);
  };

  const iconBtnCls =
    "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-transparent text-white/80 transition-all hover:scale-105 hover:bg-white/10 hover:text-white active:scale-100";

  return (
    <div
      className={`absolute bottom-0 left-0 z-20 w-full transition-opacity duration-300 ${
        playerControlShow ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      onMouseEnter={onKeepVisible}
      onMouseMove={(e) => {
        // 停留在控制条上时保持显示,不让根节点重启 2 秒隐藏计时(对齐旧 controlEnter/controlMove)
        e.stopPropagation();
        onKeepVisible();
      }}
    >
      <div
        className="mx-auto mb-6 flex w-[min(760px,92%)] flex-col gap-1 rounded-2xl px-6 py-3"
        style={{ background: "rgba(0, 0, 0, 0.35)", backdropFilter: "blur(24px)" }}
      >
        {/* 进度条 */}
        <div className="flex items-center gap-3 text-xs tabular-nums text-white/60">
          <span className="shrink-0">{playTimeData.played}</span>
          <Slider
            value={barValue}
            min={0}
            max={100}
            step={0.1}
            onValueChange={(v) => setDragBar(v)}
            onValueCommitted={commitSeek}
          />
          <span className="shrink-0">{playTimeData.durationTime}</span>
        </div>

        {/* 控制按钮行 */}
        <div className="grid grid-cols-3 items-center">
          {/* 左区:播放模式 */}
          <div className="flex items-center justify-start">
            <button
              type="button"
              className={`${iconBtnCls} text-lg`}
              title={modeMeta.label}
              onClick={() =>
                useStatusStore.setState({ playSongMode: NEXT_SONG_MODE[playSongMode] })
              }
            >
              {modeMeta.icon}
            </button>
          </div>

          {/* 中区:上一曲 / 播放暂停 / 下一曲 */}
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              className={`${iconBtnCls} rounded-full text-xl`}
              title="上一曲"
              onClick={() => void changePlayIndex("prev", true)}
            >
              ⏮
            </button>
            <button
              type="button"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-xl text-white transition-transform hover:scale-105 active:scale-100"
              style={{ background: "rgba(255, 255, 255, 0.16)" }}
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
              className={`${iconBtnCls} rounded-full text-xl`}
              title="下一曲"
              onClick={() => void changePlayIndex("next", true)}
            >
              ⏭
            </button>
          </div>

          {/* 右区:音量 + 关闭 */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className={iconBtnCls}
              title={playVolume > 0 ? "静音" : "取消静音"}
              onClick={() => setVolumeMute()}
            >
              {playVolume === 0 ? "🔇" : playVolume < 0.5 ? "🔉" : "🔊"}
            </button>
            <div className="w-24">
              <Slider
                value={playVolume}
                min={0}
                max={1}
                step={0.01}
                onValueChange={(v) => {
                  useStatusStore.setState({ playVolume: v });
                  setVolume(v);
                }}
              />
            </div>
            <button
              type="button"
              className={iconBtnCls}
              title="关闭播放器"
              onClick={() => useStatusStore.setState({ showFullPlayer: false })}
            >
              ⌄
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
