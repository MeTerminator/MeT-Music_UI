import { useEffect, useRef } from "react";
import { useStatusStore } from "@/stores/status";
import { useMusicStore } from "@/stores/music";
import { useSettingsStore } from "@/stores/settings";
import { formatArtists } from "@/lib/format";

/** 单侧封面主题色(status.coverTheme 的 light/dark 侧,值为 "r, g, b" 字符串) */
interface CoverThemeSide {
  shadeTwo?: string;
}

/** 辅助函数:绘制圆角矩形(对照旧 Test.vue roundRect) */
const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
};

/**
 * 测试页面(对照旧 src/views/Test.vue 的意图:频谱调试页)。
 * 读 status.spectrumsData(AnalyserNode getByteFrequencyData,0-255),
 * rAF 循环绘制 canvas 圆角柱形频谱;柱色取封面主题当前侧 shadeTwo,
 * 无主题时回退主题主色。附当前播放信息便于调试。
 */
const TestPage = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 当前播放信息(调试展示)
  const playState = useStatusStore((s) => s.playState);
  const playTimeData = useStatusStore((s) => s.playTimeData);
  const spectrumLength = useStatusStore((s) => s.spectrumsData.length);
  const playSongData = useMusicStore((s) => s.playSongData);

  // rAF 绘制循环(读 getState() 而非订阅,避免每帧触发 React 重渲染)
  useEffect(() => {
    let rafId = 0;
    const draw = (): void => {
      rafId = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.clientWidth;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== 80) canvas.height = 80;

      const status = useStatusStore.getState();
      const data = status.spectrumsData;

      // 柱色:封面主题当前明暗侧 shadeTwo,无主题回退 --met-primary(对照旧 coverTheme?.light?.shadeTwo)
      const themeType = useSettingsStore.getState().themeType;
      const shadeTwo = (
        status.coverTheme as { light?: CoverThemeSide; dark?: CoverThemeSide } | undefined
      )?.[themeType]?.shadeTwo;
      const color = shadeTwo
        ? `rgb(${shadeTwo})`
        : getComputedStyle(document.documentElement).getPropertyValue("--met-primary").trim() ||
          "#efefef";

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!data.length) return;

      const barWidth = 6;
      const cornerRadius = 3;
      const count = Math.min(data.length, Math.ceil(canvas.width / (barWidth * 2)));
      ctx.fillStyle = color;
      for (let i = 0; i < count; i++) {
        const value = data[i] ?? 0;
        const barHeight = (value / 255) * canvas.height;
        if (barHeight <= 0) continue;
        const x = i * (barWidth * 2);
        const y = canvas.height - barHeight;
        roundRect(ctx, x, y, barWidth, barHeight, cornerRadius);
      }
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-[var(--met-fg)]">测试页面</h1>

      {/* 当前播放信息 */}
      <div className="rounded-xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] p-5">
        <div className="mb-3 text-sm font-semibold text-[var(--met-fg)]">当前播放</div>
        <div className="flex flex-col gap-1 text-sm text-[var(--met-fg-dim)]">
          <span>
            曲目:{playSongData?.name || "暂无"}
            {playSongData?.artists ? ` - ${formatArtists(playSongData.artists)}` : ""}
          </span>
          <span>状态:{playState ? "播放中" : "已暂停"}</span>
          <span>
            进度:{playTimeData.played} / {playTimeData.durationTime}
          </span>
          <span>频谱数据长度:{spectrumLength}</span>
        </div>
      </div>

      {/* 频谱图 */}
      <div className="rounded-xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] p-5">
        <div className="mb-3 text-sm font-semibold text-[var(--met-fg)]">频谱图</div>
        {spectrumLength === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--met-fg-dim)]">
            暂无频谱数据,请先播放音乐(需在设置中开启音乐频谱)
          </div>
        ) : null}
        <canvas
          ref={canvasRef}
          className="h-20 w-full"
          style={{
            maskImage:
              "linear-gradient(90deg, hsla(0,0%,100%,0) 0, hsla(0,0%,100%,0.6) 5%, #fff 10%, #fff 75%, hsla(0,0%,100%,0.6) 85%, hsla(0,0%,100%,0))",
            WebkitMaskImage:
              "linear-gradient(90deg, hsla(0,0%,100%,0) 0, hsla(0,0%,100%,0.6) 5%, #fff 10%, #fff 75%, hsla(0,0%,100%,0.6) 85%, hsla(0,0%,100%,0))",
          }}
        />
      </div>
    </div>
  );
};

export default TestPage;
