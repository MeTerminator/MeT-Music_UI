import { computeWordProgress, type YrcLine } from "@met/core";
import { useStatusStore } from "../../stores/status";
import { useSettingsStore } from "../../stores/settings";

/**
 * 长音判定阈值(秒),对齐旧 Lyric.vue 的 lrc-long(text.duration >= 1.5)。
 * 命中且正在填充时对该字追加发光增强。
 */
const LONG_WORD_DURATION = 1.5;

interface KtvLineProps {
  /** 当前逐字歌词行(字 time/duration 为绝对秒) */
  line: YrcLine;
  /** 已唱部分颜色(渐变左半) */
  activeColor: string;
  /** 未唱部分颜色(渐变右半) */
  inactiveColor: string;
  fontSize?: number;
  className?: string;
  /** 长音字发光增强(全屏歌词开;底栏小字号建议关) */
  longGlow?: boolean;
}

/**
 * 逐字(yrc)卡拉OK填充行,LyricScroll 当前行与 PlayerBar 底栏歌词共用。
 *
 * 渲染方案对齐 App 仓桌面歌词窗(desktop-lyrics/App.tsx 的 LyricLine):
 * 每字一个 span,background-clip:text 双色渐变(左半已唱色 / 右半未唱色,
 * background-size 200%),backgroundPositionX = (1 - percent) * 100% 推进填充。
 *
 * 性能:高频 playSeek(rAF ~60fps)仅由本组件订阅,父级(整份歌词列表 /
 * PlayerBar)不订阅,行切换以外不会因进度刷新而重渲染。
 */
export default function KtvLine({
  line,
  activeColor,
  inactiveColor,
  fontSize,
  className,
  longGlow = false,
}: KtvLineProps) {
  // 仅当前行挂载本组件,60fps 重渲染范围被限制在这一行内
  const playSeek = useStatusStore((s) => s.playSeek);
  const lyricsOffset = useSettingsStore((s) => s.lyricsOffset);

  // 与引擎 playSongLyricIndex 的偏移语义一致:有效时间 = playSeek + lyricsOffset
  const progress = computeWordProgress(line, playSeek, lyricsOffset);

  return (
    <span className={className} style={{ fontSize }}>
      {line.content.map((word, index) => {
        const percent = progress[index]?.percent ?? 0;
        const filling = percent > 0 && percent < 1;
        const glow = longGlow && filling && word.duration >= LONG_WORD_DURATION;
        return (
          <span
            key={`${index}-${word.time}`}
            className="inline-block whitespace-pre"
            style={{
              backgroundImage: `linear-gradient(to right, ${activeColor} 50%, ${inactiveColor} 50%)`,
              backgroundSize: "200% 100%",
              backgroundRepeat: "no-repeat",
              backgroundPositionX: `${Math.max(0, (1 - percent) * 100).toFixed(2)}%`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              WebkitTextFillColor: "transparent",
              marginRight: word.endsWithSpace ? "0.25em" : undefined,
              // playSeek 为 rAF 高频更新,叠加短线性过渡进一步平滑(对齐旧 0.1s linear)
              transition: "background-position-x 0.12s linear",
              willChange: "background-position-x",
              filter: glow ? `drop-shadow(0 0 6px ${activeColor})` : undefined,
            }}
          >
            {word.content}
          </span>
        );
      })}
    </span>
  );
}
