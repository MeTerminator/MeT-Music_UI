export interface CacheProgressBarProps {
  /** 下载进度(0-100) */
  percent: number;
  /** 配色:bar=底部播放条(跟随主题),overlay=全屏控制条(深色毛玻璃上的白字) */
  variant?: "bar" | "overlay";
}

/**
 * 音乐资源自动缓存的下载进度条。
 *
 * 开启「音乐资源自动缓存」后需先把整首歌下载完才能开始播放,这段时间内
 * 播放进度条没有任何意义(时长与进度都还是 0),故由本组件临时顶替它充当
 * 下载进度显示器(status.songCacheProgress >= 0 时展示)。
 * 尺寸与 Slider 对齐(h-4 容器 + h-1 轨道 + px-[7px] 内边距),避免切换时跳动。
 */
export default function CacheProgressBar({ percent, variant = "bar" }: CacheProgressBarProps) {
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  const overlay = variant === "overlay";
  const textColor = overlay ? "rgba(255, 255, 255, 0.6)" : "var(--met-fg-dim)";
  const trackColor = overlay ? "rgba(255, 255, 255, 0.2)" : "var(--met-border)";
  // 服务端未返回 Content-Length 时算不出百分比(一直为 0),用呼吸动画表明仍在下载
  const indeterminate = value === 0;

  return (
    <div className="flex w-full items-center gap-2">
      <span className="w-10 shrink-0 text-right text-xs" style={{ color: textColor }}>
        缓存中
      </span>
      <div className="flex h-4 w-full items-center px-[7px]">
        <div
          className="h-1 w-full overflow-hidden rounded-full"
          style={{ background: trackColor }}
          role="progressbar"
          aria-label="歌曲缓存进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-200 ease-out ${
              indeterminate ? "animate-pulse" : ""
            }`}
            style={{
              width: indeterminate ? "100%" : `${value}%`,
              background: overlay ? "rgba(255, 255, 255, 0.7)" : "var(--met-primary)",
              opacity: indeterminate ? 0.4 : 1,
            }}
          />
        </div>
      </div>
      <span
        className="w-10 shrink-0 text-xs tabular-nums"
        style={{ color: textColor }}
      >
        {indeterminate ? "下载中" : `${value}%`}
      </span>
    </div>
  );
}
