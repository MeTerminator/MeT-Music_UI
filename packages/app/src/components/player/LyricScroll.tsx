import { useEffect, useMemo, useRef } from "react";
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

/**
 * 倒计时/前奏等待点(简版,对齐旧 CountDown.vue 的职责):
 * 当前进度早于第一句歌词时显示三个圆点,随前奏推进依次点亮,临近首句整体渐隐。
 * 独立组件订阅 playSeek,避免每帧刷新整份歌词列表。
 */
function CountDownDots({ firstTime }: { firstTime: number }) {
  const playSeek = useStatusStore((s) => s.playSeek);

  // 前奏不足 1 秒无需倒计时;已唱到首句后隐藏
  if (firstTime < 1 || playSeek >= firstTime) return null;

  const progress = Math.min(playSeek / firstTime, 1);
  return (
    <div
      className="flex items-center gap-2 px-4 pb-3 transition-opacity duration-500"
      style={{ opacity: firstTime - playSeek < 0.6 ? 0 : 1 }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-3 w-3 rounded-full transition-opacity duration-300"
          style={{
            background: "#fff",
            opacity: progress >= (i + 1) / 3 ? 0.9 : 0.25,
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
  const pureLyricMode = useStatusStore((s) => s.pureLyricMode);
  const showYrc = useSettingsStore((s) => s.showYrc);
  const showYrcAnimation = useSettingsStore((s) => s.showYrcAnimation);
  const showTransl = useSettingsStore((s) => s.showTransl);
  const showRoma = useSettingsStore((s) => s.showRoma);
  const lyricsFontSize = useSettingsStore((s) => s.lyricsFontSize);
  const lyricsPosition = useSettingsStore((s) => s.lyricsPosition);
  const lyricsBlur = useSettingsStore((s) => s.lyricsBlur);
  const lrcMousePause = useSettingsStore((s) => s.lrcMousePause);
  const countDownShow = useSettingsStore((s) => s.countDownShow);

  const containerRef = useRef<HTMLDivElement>(null);
  /** 鼠标悬停时暂停自动滚动(lrcMousePause) */
  const hoverPausedRef = useRef(false);

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

  /** 滚动当前行至容器居中 */
  const scrollToLine = (index: number) => {
    if (hoverPausedRef.current) return;
    const el = containerRef.current?.querySelector(`[data-lrc-index="${index}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // 行切换 / 歌词或布局变化时滚动(纯净模式切换会改变布局)
  useEffect(() => {
    scrollToLine(playSongLyricIndex);
  }, [playSongLyricIndex, lines, pureLyricMode]);

  // 翻译/音译对应旧规则:hasLrcTran / hasLrcRoma(yrc 与 lrc 共用该标记)
  const showTranLine = showTransl && playSongLyric.hasLrcTran;
  const showRomaLine = showRoma && playSongLyric.hasLrcRoma;
  const tranFontSize = lyricsFontSize - (lyricsFontSize < 40 ? 10 : 16);

  const align = pureLyricMode ? "center" : lyricsPosition;
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
            className={`my-1 flex cursor-pointer flex-col rounded-lg px-4 py-2.5 transition-all duration-300 hover:bg-white/10 hover:opacity-100 hover:![filter:blur(0)] ${alignCls}`}
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
            }}
          >
            {/* 当前行 + 逐字数据 + 开启逐字动画:KTV 填充;否则整行文本(现行为) */}
            {active && showYrcAnimation && line.yrc ? (
              <KtvLine
                line={line.yrc}
                fontSize={lyricsFontSize}
                activeColor="#fff"
                inactiveColor="rgba(255,255,255,0.35)"
                className="break-words font-bold"
                longGlow
              />
            ) : (
              <span
                className="break-words font-bold"
                style={{ fontSize: lyricsFontSize, color: "#fff" }}
              >
                {line.text}
              </span>
            )}
            {showTranLine && line.tran && (
              <span className="mt-2 text-white/60" style={{ fontSize: tranFontSize }}>
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
