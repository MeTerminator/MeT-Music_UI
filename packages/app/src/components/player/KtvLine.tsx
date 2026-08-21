import { useLayoutEffect, useRef, useState } from "react";
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
  /**
   * 整行超出容器宽度时横向滚动,让正在唱的字保持在容器中间
   * (底栏单行窄容器用;全屏歌词是多行折行的,不需要)。
   * 开启后本组件自带 overflow-hidden,外部不要再加 truncate。
   */
  autoScroll?: boolean;
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
  autoScroll = false,
}: KtvLineProps) {
  // 仅当前行挂载本组件,60fps 重渲染范围被限制在这一行内
  const playSeek = useStatusStore((s) => s.playSeek);
  const lyricsOffset = useSettingsStore((s) => s.lyricsOffset);

  // 与引擎 playSongLyricIndex 的偏移语义一致:有效时间 = playSeek + lyricsOffset
  const progress = computeWordProgress(line, playSeek, lyricsOffset);

  // 应居中的字:正在填充的字优先;字与字的间隙期沿用最后一个已开始的字,
  // 避免位移在间隙里回弹
  let activeIndex = 0;
  for (let i = 0; i < progress.length; i++) {
    const percent = progress[i].percent;
    if (percent > 0 && percent < 1) {
      activeIndex = i;
      break;
    }
    if (percent > 0) activeIndex = i;
  }

  const viewportRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  /** 轨道横向位移(px,<= 0);0 表示不需要滚动 */
  const [offset, setOffset] = useState(0);

  /**
   * 位移只在「当前字」或容器尺寸变化时重算,不跟每帧的填充进度走
   * (那样会变成连续平移,读起来晃);两次位移之间由 CSS transition 补平滑。
   */
  useLayoutEffect(() => {
    if (!autoScroll) return;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const measure = () => {
      // track 为 position:relative,子 span 的 offsetLeft 即相对整行左端
      const overflow = track.scrollWidth - viewport.clientWidth;
      const word = track.children[activeIndex] as HTMLElement | undefined;
      if (overflow <= 0 || !word) {
        setOffset(0);
        return;
      }
      const wordCenter = word.offsetLeft + word.offsetWidth / 2;
      // 让当前字落在容器中线,并夹在 [-overflow, 0] 内,
      // 行首/行尾不留空白(等价于 Apple Music 底栏的贴边行为)
      setOffset(Math.min(0, Math.max(-overflow, viewport.clientWidth / 2 - wordCenter)));
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    // 窗口/播放条宽度变化后原位移可能越界,重新测量
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [autoScroll, activeIndex, line]);

  const words = (
    <>
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
    </>
  );

  if (!autoScroll) {
    return (
      <span className={className} style={{ fontSize }}>
        {words}
      </span>
    );
  }

  return (
    <span ref={viewportRef} className={`block overflow-hidden ${className ?? ""}`} style={{ fontSize }}>
      <span
        ref={trackRef}
        className="relative inline-block whitespace-nowrap"
        style={{
          transform: `translateX(${offset}px)`,
          transition: "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
        }}
      >
        {words}
      </span>
    </span>
  );
}
