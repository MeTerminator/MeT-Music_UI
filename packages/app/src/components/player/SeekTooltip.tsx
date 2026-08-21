import { useRef, useState, type ReactNode } from "react";
import { getSongPlayTime } from "@met/core";
import { useStatusStore } from "../../stores/status";

export interface SeekTooltipAreaProps {
  children: ReactNode;
  /**
   * 拖动中的进度(0-100);null / undefined 表示未拖动。
   * 拖动时气泡时间以该值为准(跟随拖动),否则按鼠标 X 换算。
   */
  dragPercent?: number | null;
  /** 气泡配色:bar=跟随主题(底部播放条),overlay=深色毛玻璃(全屏控制条) */
  variant?: "bar" | "overlay";
  className?: string;
}

/**
 * 进度条 hover / 拖动时间气泡(对照旧 MainControl.vue 的 slider tooltip):
 * 包裹进度条,hover 时按鼠标 X 计算目标时间并在其上方显示小气泡;
 * 拖动时气泡时间跟随拖动值(getSongPlayTime 格式化)。
 * PlayerBar 与 FullPlayerControls 共用。
 */
export default function SeekTooltipArea({
  children,
  dragPercent,
  variant = "bar",
  className = "",
}: SeekTooltipAreaProps) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  /** 鼠标在进度条内的状态;null 表示未 hover */
  const [hover, setHover] = useState<{ x: number; percent: number } | null>(null);

  const updateHover = (clientX: number) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    setHover({ x, percent: x / rect.width });
  };

  // 无时长(未播放)时不显示气泡(仅订阅 duration,避免随播放帧刷新)
  const duration = useStatusStore((s) => s.playTimeData.duration);
  const dragging = dragPercent !== null && dragPercent !== undefined;
  const visible = duration > 0 && (hover !== null || dragging);
  const percent = dragging ? dragPercent / 100 : hover?.percent ?? 0;
  const timeText = getSongPlayTime(percent * duration);
  // 拖动但鼠标不在条上(如键盘拖动)时,按进度值定位气泡
  const rectWidth = areaRef.current?.getBoundingClientRect().width ?? 0;
  const bubbleX = hover?.x ?? percent * rectWidth;

  const bubbleStyle =
    variant === "overlay"
      ? { background: "rgba(0, 0, 0, 0.75)", color: "#fff" }
      : {
          background: "var(--met-bg-elevated)",
          color: "var(--met-fg)",
          border: "1px solid var(--met-border)",
        };

  return (
    <div
      ref={areaRef}
      className={`relative ${className}`}
      onMouseEnter={(e) => updateHover(e.clientX)}
      onMouseMove={(e) => updateHover(e.clientX)}
      onMouseLeave={() => setHover(null)}
    >
      {children}
      {visible && (
        <div
          className="pointer-events-none absolute bottom-full z-30 mb-2 -translate-x-1/2 rounded-md px-2 py-0.5 text-xs tabular-nums shadow-lg"
          style={{ ...bubbleStyle, left: bubbleX }}
          role="tooltip"
        >
          {timeText}
        </div>
      )}
    </div>
  );
}
