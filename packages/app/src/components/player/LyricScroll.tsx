import { useEffect, useMemo, useRef, useState } from "react";
import { fadePlayOrPause, setSeek, type YrcLine } from "@met/core";
import { useMusicStore } from "../../stores/music";
import { useStatusStore } from "../../stores/status";
import { useSettingsStore } from "../../stores/settings";
import KtvLine from "./KtvLine";

/** 统一后的展示行(lrc 直接映射;yrc 附带原始逐字行供 KTV 染色) */
interface DisplayLine {
  time: number;
  text: string;
  tran?: string;
  roma?: string;
  /** yrc 模式下的原始逐字行,当前行开启逐字动画时使用 */
  yrc?: YrcLine;
}

/** 歌词区上下渐隐遮罩(对齐旧 Lyric.vue 的 mask 渐变) */
const LYRIC_MASK =
  "linear-gradient(180deg, hsla(0,0%,100%,0) 0, hsla(0,0%,100%,0.6) 5%, #fff 10%, #fff 75%, hsla(0,0%,100%,0.6) 85%, hsla(0,0%,100%,0))";

/** 倒计时点呼吸动画(对照旧 CountDown.vue @keyframes breathe:scale 0.95↔1.1) */
const COUNT_DOWN_CSS = `
@keyframes met-cd-breathe {
  0% { transform: scale(0.95); }
  50% { transform: scale(1.1); }
  100% { transform: scale(0.95); }
}
`;

/**
 * 倒计时/前奏等待点(对齐旧 CountDown.vue):
 * 当前进度早于第一句歌词时显示三个圆点,随前奏推进逐个变暗消退(0.8→0.1),
 * 主题色圆点 + 呼吸动画(暂停时冻结),临近首句整体渐隐。
 * 独立组件订阅 playSeek,避免每帧刷新整份歌词列表。
 */
function CountDownDots({ firstTime }: { firstTime: number }) {
  const playSeek = useStatusStore((s) => s.playSeek);
  const playState = useStatusStore((s) => s.playState);

  // 前奏不足 1 秒无需倒计时;已唱到首句后隐藏
  if (firstTime < 1 || playSeek >= firstTime) return null;

  // 每个点的透明度(对照旧 CountDown.vue pointOpacity):
  // 前奏均分三段,所在段内 0.8 → 0.1 线性消退,已过段保持 0.1
  const perPointTime = firstTime / 3;
  const pointOpacity = (index: number): number => {
    if (playSeek <= 0) return 0;
    if (playSeek < perPointTime * (index + 1)) {
      const percentage = Math.max((playSeek - perPointTime * index) / perPointTime, 0);
      return 0.1 + 0.7 * (1 - percentage);
    }
    return 0.1;
  };

  return (
    <div
      className="flex items-center px-4 pb-3 transition-opacity duration-500"
      style={{ opacity: firstTime - playSeek < 0.6 ? 0 : 1 }}
    >
      <style>{COUNT_DOWN_CSS}</style>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="mr-3 h-7 w-7 rounded-full transition-opacity duration-300 last:mr-0 max-md:h-5 max-md:w-5"
          style={{
            background: "rgb(var(--fp-primary-rgb, 255, 255, 255))",
            opacity: pointOpacity(i),
            // 呼吸动画,三点交错相位;暂停时冻结
            animation: "met-cd-breathe 4s ease-in-out infinite",
            animationDelay: `${i * -1.33}s`,
            animationPlayState: playState ? "running" : "paused",
          }}
        />
      ))}
    </div>
  );
}

/**
 * 普通滚动歌词(对齐旧 Lyric.vue):
 * useAMLyrics=false 或无 AM 歌词数据时使用。当前行高亮并平滑滚动居中,
 * 行点击跳转进度,支持翻译/音译、字号、对齐、行模糊与鼠标悬停暂停滚动。
 */
export default function LyricScroll() {
  const playSongLyric = useMusicStore((s) => s.playSongLyric);
  const playSongLyricIndex = useStatusStore((s) => s.playSongLyricIndex);
  /** 仅歌词模式:歌词占满全屏,强制居中对齐 */
  const lyricOnly = useStatusStore((s) => s.lyricViewMode === "only");
  const showYrc = useSettingsStore((s) => s.showYrc);
  const showYrcAnimation = useSettingsStore((s) => s.showYrcAnimation);
  const showTransl = useSettingsStore((s) => s.showTransl);
  const showRoma = useSettingsStore((s) => s.showRoma);
  const lyricsFontSize = useSettingsStore((s) => s.lyricsFontSize);
  const lyricsPosition = useSettingsStore((s) => s.lyricsPosition);
  const lyricsBlur = useSettingsStore((s) => s.lyricsBlur);
  const lyricsBlock = useSettingsStore((s) => s.lyricsBlock);
  const lrcMousePause = useSettingsStore((s) => s.lrcMousePause);
  const countDownShow = useSettingsStore((s) => s.countDownShow);

  const containerRef = useRef<HTMLDivElement>(null);
  /** 鼠标悬停时暂停自动滚动(lrcMousePause) */
  const hoverPausedRef = useRef(false);
  /** 手动滚动(滚轮/触摸)后的保持期:自动滚动让位,静置 3s 后恢复 */
  const manualHoldRef = useRef(false);
  const manualTimerRef = useRef<number | undefined>(undefined);

  // 视口宽度(移动端响应式字号用,对照旧 Lyric.vue 700px 断点的 vw 字号)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const useYrc = showYrc && playSongLyric.hasYrc && playSongLyric.yrc.length > 0;

  const lines = useMemo<DisplayLine[]>(() => {
    if (useYrc) {
      return playSongLyric.yrc.map((line) => ({
        time: line.time,
        text: line.content
          .map((word) => word.content + (word.endsWithSpace ? " " : ""))
          .join("")
          .trimEnd(),
        tran: line.tran,
        roma: line.roma,
        yrc: line,
      }));
    }
    return playSongLyric.lrc.map((line) => ({
      time: line.time,
      text: line.content,
      tran: line.tran,
      roma: line.roma,
    }));
  }, [playSongLyric, useYrc]);

  /**
   * 滚动当前行(对照旧 Lyric.vue lyricsScroll 167-180):
   * lyricsBlock === "center" 时居中,否则("start")滚动到偏上位置
   * (容器 scrollTop = 行相对容器 offsetTop - 80)。
   */
  const scrollToLine = (index: number, force = false) => {
    // force:用户点击行跳转等明确意图,绕过 hover/手动滚动保持
    if (!force && (hoverPausedRef.current || manualHoldRef.current)) return;
    const container = containerRef.current;
    const el = container?.querySelector<HTMLElement>(`[data-lrc-index="${index}"]`);
    if (!container || !el) return;
    if (lyricsBlock === "center") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const scrollDistance =
      container.scrollTop +
      el.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      80;
    container.scrollTo({ top: scrollDistance, behavior: "smooth" });
  };

  // 行切换 / 歌词或布局变化时滚动(纯净模式切换会改变布局)
  useEffect(() => {
    scrollToLine(playSongLyricIndex);
  }, [playSongLyricIndex, lines, lyricOnly, lyricsBlock]);

  // 翻译/音译对应旧规则:hasLrcTran / hasLrcRoma(yrc 与 lrc 共用该标记)
  const showTranLine = showTransl && playSongLyric.hasLrcTran;
  const showRomaLine = showRoma && playSongLyric.hasLrcRoma;
  const tranFontSize = lyricsFontSize - (lyricsFontSize < 40 ? 10 : 16);
  // 移动端响应式字号(对照旧 Lyric.vue 窄屏 6.5vw / 4.5vw):
  // <768px 时主行取 min(lyricsFontSize, 6.5vw)、翻译取 min(tranFontSize, 4.5vw),
  // 以数值计算保证 KtvLine(仅接受 number)同样生效
  const isNarrow = viewportWidth < 768;
  const mainFontSize = isNarrow
    ? Math.min(lyricsFontSize, viewportWidth * 0.065)
    : lyricsFontSize;
  const tranLineFontSize = isNarrow
    ? Math.min(tranFontSize, viewportWidth * 0.045)
    : tranFontSize;

  const align = lyricOnly ? "center" : lyricsPosition;
  const alignCls =
    align === "center"
      ? "items-center text-center"
      : align === "right"
        ? "items-end text-right"
        : "items-start text-left";
  const transformOrigin =
    align === "center" ? "center center" : align === "right" ? "right center" : "left center";

  return (
    <div
      ref={containerRef}
      className="lyric-font h-full w-full overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        maskImage: LYRIC_MASK,
        WebkitMaskImage: LYRIC_MASK,
        filter: "drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.2))",
      }}
      onMouseEnter={() => {
        if (lrcMousePause) hoverPausedRef.current = true;
      }}
      onMouseLeave={() => {
        hoverPausedRef.current = false;
        scrollToLine(useStatusStore.getState().playSongLyricIndex);
      }}
      // 手动滚动保持:滚轮/触摸拖动后 3s 内自动滚动让位,
      // 静置后回到当前行(点击行跳转会立即清除保持并强制定位)
      onWheel={() => {
        manualHoldRef.current = true;
        window.clearTimeout(manualTimerRef.current);
        manualTimerRef.current = window.setTimeout(() => {
          manualHoldRef.current = false;
          scrollToLine(useStatusStore.getState().playSongLyricIndex);
        }, 3000);
      }}
      onTouchMove={() => {
        manualHoldRef.current = true;
        window.clearTimeout(manualTimerRef.current);
        manualTimerRef.current = window.setTimeout(() => {
          manualHoldRef.current = false;
          scrollToLine(useStatusStore.getState().playSongLyricIndex);
        }, 3000);
      }}
    >
      {/* 顶部占位 + 倒计时(前奏等待) */}
      <div className={`flex h-[26vh] w-full shrink-0 flex-col justify-end ${alignCls}`}>
        {countDownShow && lines[0] && <CountDownDots firstTime={lines[0].time} />}
      </div>

      {lines.map((line, index) => {
        const active = playSongLyricIndex === index;
        return (
          <div
            key={`${index}-${line.time}`}
            data-lrc-index={index}
            className={`my-1 flex cursor-pointer flex-col rounded-lg px-4 py-2.5 transition-all duration-300 hover:bg-[rgba(var(--fp-main-rgb,255,255,255),0.08)] hover:opacity-100 hover:![filter:blur(0)] ${alignCls}`}
            style={{
              opacity: active ? 1 : 0.32,
              transform: active ? "scale(1)" : "scale(0.86)",
              transformOrigin,
              filter: lyricsBlur
                ? `blur(${Math.min(Math.abs(playSongLyricIndex - index) * 1.5, 10)}px)`
                : undefined,
            }}
            onClick={() => {
              // 行点击跳转;暂停态恢复播放(对照旧 Lyric.vue jumpSeek:房内不本地起播)
              setSeek(line.time);
              const status = useStatusStore.getState();
              if (!status.playState && !status.isInRoom) fadePlayOrPause("play");
              // 乐观更新歌词索引:真实播放 seek 有缓冲延迟,索引若停在旧行,
              // 点击行连同视口内所有行都会按距离被 blur 到不可读
              // (引擎下一拍按新进度重算,结果一致)
              useStatusStore.setState({ playSongLyricIndex: index });
              // 点击即明确定位意图:清除手动滚动保持并强制滚到该行
              manualHoldRef.current = false;
              window.clearTimeout(manualTimerRef.current);
              scrollToLine(index, true);
            }}
          >
            {/* 当前行 + 逐字数据 + 开启逐字动画:KTV 填充;否则整行文本(现行为) */}
            {active && showYrcAnimation && line.yrc ? (
              <KtvLine
                line={line.yrc}
                fontSize={mainFontSize}
                activeColor="#fff"
                inactiveColor="rgba(255,255,255,0.35)"
                className="break-words font-bold"
                longGlow
              />
            ) : (
              <span
                className="break-words font-bold"
                style={{ fontSize: mainFontSize, color: "#fff" }}
              >
                {line.text}
              </span>
            )}
            {showTranLine && line.tran && (
              <span className="mt-2 text-white/60" style={{ fontSize: tranLineFontSize }}>
                {line.tran}
              </span>
            )}
            {showRomaLine && line.roma && (
              <span className="mt-1 text-xl text-white/60">{line.roma}</span>
            )}
          </div>
        );
      })}

      {/* 底部占位,保证最后一行也能滚动到中部 */}
      <div className="h-[40vh] w-full shrink-0" />
    </div>
  );
}
