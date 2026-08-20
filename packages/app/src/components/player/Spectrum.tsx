import { useStatusStore } from "../../stores/status";

/** 频谱条数量(对分析器数据降采样) */
const BAR_COUNT = 64;

/** 左右边缘渐隐遮罩(对照旧 Spectrum.vue 110-158 的 mask 渐变) */
const SPECTRUM_MASK =
  "linear-gradient(90deg, hsla(0,0%,100%,0) 0, hsla(0,0%,100%,0.6) 10%, #fff 15%, #fff 85%, hsla(0,0%,100%,0.6) 90%, hsla(0,0%,100%,0))";

export interface SpectrumProps {
  /** 是否可见(控制条显示时淡出,对齐旧 Spectrum.vue 的 :show="!playerControlShow") */
  visible: boolean;
  /** 频谱高度(px),默认 60 */
  height?: number;
  /** 柱色(FullPlayer 由 coverTheme 主题色驱动传入),缺省回退白色系 */
  color?: string;
}

/**
 * 简版音乐频谱(对齐旧 Spectrum.vue 的职责,渲染改为 div bars)。
 * 数据源为 status.spectrumsData(AnalyserNode 的 getByteFrequencyData,0-255),
 * 每帧更新,降采样为 64 条取段内均值。
 */
export default function Spectrum({
  visible,
  height = 60,
  color = "rgba(255, 255, 255, 0.35)",
}: SpectrumProps) {
  const spectrumsData = useStatusStore((s) => s.spectrumsData);

  if (spectrumsData.length === 0) return null;

  // 高频段基本无能量,只取前 3/4 数据参与展示
  const usable = Math.max(Math.floor(spectrumsData.length * 0.75), BAR_COUNT);
  const step = Math.max(Math.floor(usable / BAR_COUNT), 1);
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const start = i * step;
    let sum = 0;
    let count = 0;
    for (let j = start; j < start + step && j < spectrumsData.length; j++) {
      sum += spectrumsData[j];
      count++;
    }
    bars.push(count > 0 ? sum / count : 0);
  }

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute bottom-0 left-0 z-0 w-full transition-opacity duration-500 ${
        visible ? "opacity-60" : "opacity-0"
      }`}
      style={{ height }}
    >
      {/* 居中限宽容器(max-width 1600)+ 左右边缘渐隐 mask(对照旧 Spectrum.vue) */}
      <div
        className="mx-auto flex h-full w-full max-w-[1600px] items-end justify-center gap-[3px] px-10"
        style={{ maskImage: SPECTRUM_MASK, WebkitMaskImage: SPECTRUM_MASK }}
      >
        {bars.map((value, i) => (
          <div
            key={i}
            className="min-w-[2px] flex-1 rounded-t-[2px]"
            style={{
              maxWidth: 10,
              height: `${Math.max((value / 255) * 100, 3)}%`,
              background: color,
            }}
          />
        ))}
      </div>
    </div>
  );
}
