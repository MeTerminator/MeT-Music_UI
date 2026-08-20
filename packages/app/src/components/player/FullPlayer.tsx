import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BackgroundRender,
  LyricPlayer,
  type LyricPlayerRef,
} from "@applemusic-like-lyrics/react";
import type { LyricLineMouseEvent } from "@applemusic-like-lyrics/core";
import "@applemusic-like-lyrics/core/style.css";
import { X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { setSeek, type AMLine, type Artist } from "@met/core";
import { useStatusStore } from "../../stores/status";
import { useMusicStore } from "../../stores/music";
import { useSettingsStore } from "../../stores/settings";
import { formatArtists } from "./format";
import FullPlayerControls from "./FullPlayerControls";
import LyricScroll from "./LyricScroll";
import PlayerCover from "./PlayerCover";
import Spectrum from "./Spectrum";

/** 歌词区上下渐隐遮罩(对齐旧 AMLyric.vue / Lyric.vue) */
const LYRIC_MASK =
  "linear-gradient(180deg, hsla(0,0%,100%,0) 0, hsla(0,0%,100%,0.6) 5%, #fff 10%, #fff 75%, hsla(0,0%,100%,0.6) 85%, hsla(0,0%,100%,0))";

/** 单侧封面主题色(status.coverTheme 的 light/dark 侧,值为 "r, g, b" 字符串) */
interface CoverThemeSide {
  primary?: string;
  shade?: string;
  shadeTwo?: string;
  bg?: string;
  mainBg?: string;
}

/**
 * animation 背景(对照旧 FullPlayer.vue 417-451 行 CSS):
 * 四象限大图 blur(80px)+contrast(1.75),各自不同时长 rotate 动画。
 */
const ANIMATION_BG_QUADRANTS: {
  pos: CSSProperties;
  duration: number;
  reverse: boolean;
}[] = [
  { pos: { top: 0, left: 0 }, duration: 62, reverse: false },
  { pos: { left: 0, bottom: 0 }, duration: 55, reverse: true },
  { pos: { bottom: "50%", right: 0 }, duration: 58, reverse: true },
  { pos: { bottom: 0, right: 0 }, duration: 65, reverse: false },
];

const FULL_PLAYER_CSS = `
@keyframes met-fp-cover-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

/**
 * AMLL 流体背景的封面地址(对齐旧 FullPlayer.vue 的 AmllAlbum computed):
 * QQ 音乐图床跨域会导致 WebGL 纹理读取失败,改走本站代理。
 */
const toAmllAlbumUrl = (src: string | undefined): string | undefined => {
  if (!src) return undefined;
  if (src.startsWith("https://y.qq.com/music/photo_new/")) {
    const cleaned = src
      .replace("https://y.qq.com/music/photo_new/", "")
      .replace("?param=100y100", "");
    return `/api/web/album/cover/pic?pic=${cleaned}`;
  }
  return src;
};

/**
 * 屏幕常亮(对齐旧 FullPlayer.vue 的 wakeLock 用法):
 * active(全屏播放器打开且播放中)时请求 screen wake lock,
 * 关闭/暂停时释放;页面隐藏时浏览器会自动释放,
 * visibilitychange 恢复可见且仍需常亮时重新请求。API 不可用或被拒绝时静默。
 */
function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let disposed = false;

    const request = async () => {
      if (document.visibilityState !== "visible") return;
      if (sentinelRef.current && !sentinelRef.current.released) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        // 等待期间已暂停/关闭则立即释放,避免悬挂的锁
        if (disposed || !activeRef.current) {
          void sentinel.release().catch(() => undefined);
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // 低电量模式 / 权限策略等原因请求失败时静默
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && activeRef.current) void request();
    };

    void request();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel) void sentinel.release().catch(() => undefined);
    };
  }, [active]);
}

/**
 * 全屏播放器(U3:对齐旧 FullPlayer.vue 功能)。
 * showFullPlayer 为 true 时挂载,覆盖于 PlayerBar 之上(z-40)。
 */
export default function FullPlayer() {
  const showFullPlayer = useStatusStore((s) => s.showFullPlayer);
  // 关闭时整体卸载,保证 Esc/overflow/计时器等副作用随之清理
  if (!showFullPlayer) return null;
  return <FullPlayerInner />;
}

function FullPlayerInner() {
  const coverBackground = useStatusStore((s) => s.coverBackground);
  const coverTheme = useStatusStore((s) => s.coverTheme);
  const playState = useStatusStore((s) => s.playState);
  const playSeekMs = useStatusStore((s) => s.playSeekMs);
  const playerControlShow = useStatusStore((s) => s.playerControlShow);
  const pureLyricMode = useStatusStore((s) => s.pureLyricMode);
  const playSongData = useMusicStore((s) => s.playSongData);
  const playSongLyric = useMusicStore((s) => s.playSongLyric);

  const playerBackgroundType = useSettingsStore((s) => s.playerBackgroundType);
  const playCoverType = useSettingsStore((s) => s.playCoverType);
  const themeType = useSettingsStore((s) => s.themeType);
  const amllPlayerBackgroundFlowSpeed = useSettingsStore((s) => s.amllPlayerBackgroundFlowSpeed);
  const useAMLyrics = useSettingsStore((s) => s.useAMLyrics);
  const showYrc = useSettingsStore((s) => s.showYrc);
  const useAMttmlDB = useSettingsStore((s) => s.useAMttmlDB);
  const lyricsAMttmlUseOffset = useSettingsStore((s) => s.lyricsAMttmlUseOffset);
  const lyricsAMOffset = useSettingsStore((s) => s.lyricsAMOffset);
  const lyricsAMEndTimeOffset = useSettingsStore((s) => s.lyricsAMEndTimeOffset);
  const useAMSpring = useSettingsStore((s) => s.useAMSpring);
  const useAMScale = useSettingsStore((s) => s.useAMScale);
  const lyricsFontSize = useSettingsStore((s) => s.lyricsFontSize);
  const lyricsBlur = useSettingsStore((s) => s.lyricsBlur);
  const lyricsBlock = useSettingsStore((s) => s.lyricsBlock);
  const showSpectrums = useSettingsStore((s) => s.showSpectrums);

  /**
   * 修复(缺陷 B):挂载时 store 已有歌词但 LyricPlayer 空白。
   * 根因见文件底部注释。三层防护:
   * 1. 推迟一帧挂载 LyricPlayer,避开全屏层首帧提交时的布局/StrictMode 抖动;
   * 2. key 随歌曲与歌词数据变化强制重建 core player;
   * 3. ensureLyricApplied:挂载后经 ref 校验 core 实例是否真的持有歌词行,
   *    缺失则手动补写(实测 StrictMode 下绑定层会把歌词写进已 dispose 的旧实例)。
   */
  const [lyricReady, setLyricReady] = useState(false);
  const lyricPlayerRef = useRef<LyricPlayerRef>(null);
  useEffect(() => {
    // rAF 在页面不可见时不会触发,补一个 setTimeout 兜底
    let done = false;
    const ready = () => {
      if (!done) {
        done = true;
        setLyricReady(true);
      }
    };
    const raf = requestAnimationFrame(ready);
    const timer = window.setTimeout(ready, 80);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);

  // 播放器打开且播放中时保持屏幕常亮
  useWakeLock(playState);

  // Esc 关闭全屏;打开期间锁定 body 滚动
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 处于浏览器全屏时 Esc 由浏览器消费(退出全屏),不连带关闭播放器
      if (e.key === "Escape" && !document.fullscreenElement) {
        useStatusStore.setState({ showFullPlayer: false });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // ===== 控制条显隐:鼠标移动唤出,静止 2 秒淡出(对齐旧 controlShowChange) =====
  const hideTimerRef = useRef<number | null>(null);
  const lastMoveRef = useRef(0);

  const pokeControls = useCallback(() => {
    const now = performance.now();
    if (now - lastMoveRef.current < 150) return; // 节流
    lastMoveRef.current = now;
    useStatusStore.setState({ playerControlShow: true });
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      useStatusStore.setState({ playerControlShow: false });
    }, 2000);
  }, []);

  /** 悬停控制条时保持可见(清除隐藏计时器) */
  const keepControlsVisible = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    useStatusStore.setState({ playerControlShow: true });
  }, []);

  const hideControls = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    useStatusStore.setState({ playerControlShow: false });
  }, []);

  // 打开即视为一次交互;卸载时清理计时器并恢复显示状态
  useEffect(() => {
    lastMoveRef.current = -1000;
    pokeControls();
    return () => {
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      useStatusStore.setState({ playerControlShow: true });
    };
  }, [pokeControls]);

  const onLyricLineClick = useCallback((e: LyricLineMouseEvent) => {
    setSeek(e.line.getLine().startTime / 1000);
  }, []);

  // ===== 歌词数据 =====
  // TTML 特效歌词优先(对齐旧 AMLyric.vue 的 amLyricsData computed):
  // hasTtml && useAMttmlDB 时使用 ttml 行;深拷贝隔离,因 AMLL 会原地变更行对象
  const ttmlLines = useMemo<AMLine[]>(() => {
    const raw = playSongLyric.ttml;
    if (!raw || raw.length === 0) return [];
    return JSON.parse(JSON.stringify(raw)) as AMLine[];
  }, [playSongLyric.ttml]);
  const useTtml = useAMLyrics && Boolean(playSongLyric.hasTtml) && useAMttmlDB && ttmlLines.length > 0;
  const useYrcAM = !useTtml && useAMLyrics && playSongLyric.hasYrc && showYrc;
  // 非 TTML 的 yrcAM/lrcAM:行 endTime 减去 lyricsAMEndTimeOffset
  // (对照旧 AMLyric.vue 127-130;TTML 路径不做此偏移,保持上方深拷贝分支不变)
  const plainAMLines = useMemo<AMLine[]>(() => {
    const source = (useYrcAM ? playSongLyric.yrcAM : playSongLyric.lrcAM) ?? [];
    if (!lyricsAMEndTimeOffset) return source;
    return source.map((line) => ({
      ...line,
      endTime: line.endTime - lyricsAMEndTimeOffset,
    }));
  }, [useYrcAM, playSongLyric.yrcAM, playSongLyric.lrcAM, lyricsAMEndTimeOffset]);
  const amLines = useTtml ? ttmlLines : plainAMLines;
  const amLyricMode = useTtml ? "ttml" : useYrcAM ? "yrc" : "lrc";
  // 旧 isHasLrc 规则:lrc 首行存在且行数 > 4
  const hasPlainLyric = Boolean(playSongLyric.lrc?.[0]) && playSongLyric.lrc.length > 4;
  const useAM = useAMLyrics && amLines.length > 0;
  const hasLyric = useAM || hasPlainLyric;
  const purelyLyric = pureLyricMode && hasLyric;

  // currentTime 偏移修正(对齐旧 AMLyric.vue 三元):仅 TTML 歌词且开启
  // lyricsAMttmlUseOffset 时叠加 lyricsAMOffset,其余路径用原始 playSeekMs
  const applyAMOffset = useTtml && lyricsAMttmlUseOffset;
  const amCurrentTime = Math.max(
    0,
    Math.round(applyAMOffset ? playSeekMs + lyricsAMOffset : playSeekMs),
  );

  // 缺陷 B 兜底:LyricPlayer 挂载/歌词变化后,校验 core 实例已持有歌词,缺失则补写
  useEffect(() => {
    if (!lyricReady || !useAM || amLines.length === 0) return;
    const timer = window.setTimeout(() => {
      const core = lyricPlayerRef.current?.lyricPlayer;
      if (!core || core.getLyricLines().length === amLines.length) return;
      const seekMs = useStatusStore.getState().playSeekMs;
      const time = Math.max(
        0,
        Math.round(applyAMOffset ? seekMs + lyricsAMOffset : seekMs),
      );
      core.setLyricLines(amLines, time);
      core.setCurrentTime(time, true);
      void core.calcLayout(true, true);
      core.update();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [lyricReady, useAM, amLines, applyAMOffset, lyricsAMOffset]);

  // ===== 封面与背景 =====
  const coverSmall = playSongData.coverSize?.s || playSongData.localCover || playSongData.cover;
  const amllAlbum = toAmllAlbumUrl(coverSmall);
  const artistsText = formatArtists(playSongData.artists);
  const artistList: Artist[] | null = Array.isArray(playSongData.artists)
    ? playSongData.artists
    : null;
  const albumData =
    playSongData.album && typeof playSongData.album !== "string" ? playSongData.album : null;
  const albumText = playSongData.album
    ? typeof playSongData.album === "string"
      ? playSongData.album
      : playSongData.album.name
    : "";
  const aliaText = typeof playSongData.alia === "string" ? playSongData.alia : "";

  const showAmllBackground = playerBackgroundType === "amllAnimation" && Boolean(amllAlbum);
  const showAnimationBackground =
    playerBackgroundType === "animation" && Boolean(coverSmall) && !showAmllBackground;
  const showBlurBackground =
    playerBackgroundType === "blur" && Boolean(coverSmall) && !showAmllBackground;
  const gradientBackground = coverBackground || "var(--met-bg)";

  // ===== coverTheme 主题色驱动前景(对照旧 --cover-main-color 体系) =====
  // 取当前明暗侧(settings.themeType)的 shadeTwo/primary("r, g, b" 字符串),
  // 写入容器局部 CSS 变量;无 coverTheme 时回退现白色系
  const coverThemeSide = (
    coverTheme as { light?: CoverThemeSide; dark?: CoverThemeSide } | undefined
  )?.[themeType];
  const mainRgb = coverThemeSide?.shadeTwo || "255, 255, 255";
  const primaryRgb = coverThemeSide?.primary || "255, 255, 255";
  const amLyricColor = `rgba(${mainRgb}, 0.95)`; // 对照旧 AMLyric.vue 109-112

  // ===== 全屏歌手/专辑跳转(对照旧 FullPlayer.vue 66-99 行) =====
  const navigate = useNavigate();
  const gotoArtist = useCallback(
    (id: number | string) => {
      useStatusStore.setState({ showFullPlayer: false });
      void navigate({ to: "/artist", search: { id: String(id) } });
    },
    [navigate],
  );
  const gotoAlbum = useCallback(
    (id: number | string) => {
      useStatusStore.setState({ showFullPlayer: false });
      void navigate({ to: "/album", search: { id: String(id) } });
    },
    [navigate],
  );

  return (
    <div
      className="fixed inset-0 z-40 select-none overflow-hidden"
      style={
        {
          background: "var(--met-bg)",
          cursor: playerControlShow ? "auto" : "none",
          // 局部主题色变量(对照旧 --cover-main-color / --cover-second-color)
          "--fp-main-rgb": mainRgb,
          "--fp-primary-rgb": primaryRgb,
        } as CSSProperties
      }
      onMouseMove={pokeControls}
      onTouchStart={pokeControls}
      onMouseLeave={hideControls}
    >
      <style>{FULL_PLAYER_CSS}</style>
      {/* ===== 背景层(按 settings.playerBackgroundType 分支) ===== */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {showAmllBackground ? (
          <div className="absolute inset-0">
            <BackgroundRender
              album={amllAlbum}
              albumIsVideo={false}
              playing={playState}
              fps={30}
              flowSpeed={amllPlayerBackgroundFlowSpeed}
              renderScale={0.5}
              hasLyric={hasLyric}
            />
          </div>
        ) : showAnimationBackground ? (
          // animation:四象限旋转模糊大图(对照旧 FullPlayer.vue 417-451 行 CSS)
          <div className="absolute inset-0" style={{ transform: "scale(1.3)" }}>
            {ANIMATION_BG_QUADRANTS.map((q, i) => (
              <img
                key={i}
                src={coverSmall}
                alt=""
                aria-hidden
                className="absolute h-1/2 w-1/2 max-w-none object-cover"
                style={{
                  ...q.pos,
                  filter: "blur(80px) contrast(1.75)",
                  animation: `met-fp-cover-rotate ${q.duration}s linear infinite${
                    q.reverse ? " reverse" : ""
                  }`,
                  // 暂停冻结
                  animationPlayState: playState ? "running" : "paused",
                }}
              />
            ))}
          </div>
        ) : showBlurBackground ? (
          <img
            src={coverSmall}
            alt=""
            aria-hidden
            className="absolute left-1/2 top-1/2 h-[150%] w-[150%] max-w-none -translate-x-1/2 -translate-y-1/2 object-cover blur-3xl"
            style={{ filter: "blur(80px) contrast(1.2)" }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: gradientBackground }} />
        )}
        {/* 暗化遮罩,保证前景可读性(对齐旧 .overlay::after) */}
        <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.4)" }} />
      </div>

      {/* ===== 顶部菜单:纯净歌词切换 + 关闭(随控制条显隐) ===== */}
      <div
        className={`absolute left-0 top-0 z-20 flex w-full items-center justify-between p-5 transition-opacity duration-300 ${
          playerControlShow ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div>
          {hasLyric && (
            <button
              type="button"
              className={`flex h-9 cursor-pointer items-center rounded-lg px-3 text-sm transition-all hover:bg-[rgba(var(--fp-main-rgb),0.14)] ${
                pureLyricMode
                  ? "bg-[rgba(var(--fp-main-rgb),0.14)] text-[rgb(var(--fp-main-rgb))]"
                  : "text-[rgba(var(--fp-main-rgb),0.5)] hover:text-[rgb(var(--fp-main-rgb))]"
              }`}
              title={pureLyricMode ? "退出纯净歌词模式" : "纯净歌词模式"}
              onClick={() => useStatusStore.setState({ pureLyricMode: !pureLyricMode })}
            >
              纯净歌词
            </button>
          )}
        </div>
        <button
          type="button"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-lg text-[rgba(var(--fp-main-rgb),0.7)] transition-all hover:scale-105 hover:bg-[rgba(var(--fp-main-rgb),0.14)] hover:text-[rgb(var(--fp-main-rgb))]"
          title="关闭播放器 (Esc)"
          onClick={() => useStatusStore.setState({ showFullPlayer: false })}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {/* ===== 主体(窄屏/竖屏 max-md 时上下堆叠,对齐旧页 700px 断点) ===== */}
      <div className="relative z-10 flex h-full w-full items-center max-md:flex-col max-md:items-stretch">
        {/* 左半:大封面 + 歌曲信息(纯净歌词模式下隐藏;窄屏有歌词时缩小并置顶) */}
        {!purelyLyric && (
          <div
            className={`flex h-full flex-col items-center justify-center gap-6 px-10 ${
              hasLyric
                ? "w-[45%] max-md:h-auto max-md:w-full max-md:shrink-0 max-md:justify-start max-md:gap-3 max-md:px-6 max-md:pb-1 max-md:pt-20"
                : "w-full max-md:px-6"
            }`}
          >
            {/* 封面(cover/record 两种模式,见 PlayerCover) */}
            <PlayerCover
              className={
                playCoverType === "record"
                  ? `max-w-[min(46vh,420px)] ${
                      hasLyric ? "max-md:max-w-[min(180px,30vh)]" : "max-md:max-w-[60vw]"
                    }`
                  : `max-w-[420px] ${
                      hasLyric ? "max-md:max-w-[min(200px,32vh)]" : "max-md:max-w-[70vw]"
                    }`
              }
            />
            <div className="w-full max-w-[420px] text-center">
              <div
                className="truncate text-2xl font-bold max-md:text-lg"
                style={{ color: "rgb(var(--fp-main-rgb))" }}
              >
                {playSongData.name || "未知曲目"}
              </div>
              {aliaText && (
                <div
                  className="mt-1 truncate text-base max-md:text-sm"
                  style={{ color: "rgba(var(--fp-main-rgb), 0.6)" }}
                >
                  {aliaText}
                </div>
              )}
              {/* 歌手:有 id 时可点跳转 /artist(对照旧 FullPlayer.vue 66-99 行) */}
              <div
                className="mt-2 truncate text-sm max-md:mt-1 max-md:text-xs"
                style={{ color: "rgba(var(--fp-main-rgb), 0.7)" }}
              >
                {artistList && artistList.length > 0
                  ? artistList.map((ar, index) => (
                      <span key={`${ar.id ?? "no-id"}-${index}`}>
                        {index > 0 && <span> / </span>}
                        {ar.id != null ? (
                          <span
                            role="link"
                            tabIndex={0}
                            className="cursor-pointer transition-colors hover:text-[rgb(var(--fp-main-rgb))] hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              gotoArtist(ar.id as number | string);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") gotoArtist(ar.id as number | string);
                            }}
                          >
                            {ar.name}
                          </span>
                        ) : (
                          <span>{ar.name}</span>
                        )}
                      </span>
                    ))
                  : artistsText || "未知艺术家"}
              </div>
              {/* 专辑:album.id 存在时可点跳转 /album */}
              {albumText && (
                <div
                  className="mt-1 truncate text-sm max-md:hidden"
                  style={{ color: "rgba(var(--fp-main-rgb), 0.5)" }}
                >
                  {albumData?.id != null ? (
                    <span
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer transition-colors hover:text-[rgb(var(--fp-main-rgb))] hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        gotoAlbum(albumData.id as number | string);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") gotoAlbum(albumData.id as number | string);
                      }}
                    >
                      {albumText}
                    </span>
                  ) : (
                    albumText
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 右半:歌词区(纯净模式下占满居中;窄屏堆叠时占据剩余高度) */}
        {hasLyric && (
          <div
            className={`flex h-full min-w-0 flex-col justify-center ${
              purelyLyric
                ? "w-full px-[12%] max-md:px-6"
                : "flex-1 pr-10 max-md:h-auto max-md:min-h-0 max-md:w-full max-md:px-6 max-md:pr-6"
            }`}
          >
            {useAM ? (
              <div
                className="relative h-[86%] w-full overflow-hidden max-md:h-full"
                style={{
                  maskImage: LYRIC_MASK,
                  WebkitMaskImage: LYRIC_MASK,
                  filter: "drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.2))",
                  mixBlendMode: "plus-lighter",
                }}
              >
                {lyricReady && (
                  <LyricPlayer
                    // 歌词数据变化时强制重建 core player,规避绑定层 setLyricLines 时序缺陷
                    key={`${playSongData.id}-${amLyricMode}-${amLines.length}`}
                    ref={lyricPlayerRef}
                    className="lyric-font h-full w-full"
                    style={
                      {
                        fontSize: `${lyricsFontSize}px`,
                        // 对照旧 AMLyric.vue 109-112:coverTheme shadeTwo rgba 0.95
                        "--amll-lp-color": amLyricColor,
                      } as CSSProperties
                    }
                    lyricLines={amLines}
                    currentTime={amCurrentTime}
                    playing={playState}
                    enableSpring={useAMSpring}
                    enableScale={useAMScale}
                    enableBlur={lyricsBlur}
                    alignPosition={lyricsBlock === "center" ? 0.5 : 0.25}
                    onLyricLineClick={onLyricLineClick}
                  />
                )}
              </div>
            ) : (
              <div className="h-[86%] w-full max-md:h-full">
                <LyricScroll />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== 底部:频谱(窄屏隐藏)+ 悬浮控制条 ===== */}
      {showSpectrums && (
        <div className="max-md:hidden">
          <Spectrum visible={!playerControlShow} color={`rgba(${mainRgb}, 0.35)`} />
        </div>
      )}
      <FullPlayerControls onKeepVisible={keepControlsVisible} />
    </div>
  );
}

/*
 * 缺陷 B 根因(挂载时 store 已有歌词但 LyricPlayer 空白,重开后正常):
 * @applemusic-like-lyrics/react 的绑定在 useLayoutEffect 中 new 出 core player 并
 * setCorePlayer 存入 state;setLyricLines 由另一个依赖 [corePlayer, lyricLines] 的
 * useLayoutEffect 调用。React 19 StrictMode 会在挂载后立刻销毁并重建所有 effect:
 * 旧实例被 dispose(元素移出 DOM),重建的 effect 以"旧 render 闭包"执行,把歌词
 * 写进了已 dispose 的旧实例;新实例依赖 setCorePlayer(新实例) 触发的后续 render 才能
 * 拿到歌词。实测(dev console 仅出现两次 AMLL 的"设置歌词行"日志,且存活实例的
 * DOM 中没有任何歌词行分组)该后续 render 的歌词写入并未落在存活实例上——此后只要
 * LyricPlayer 因任意 props 变化再渲染一次即可自愈(依赖数组比对差异触发重设),
 * 因此播放中(currentTime 每帧变化)几乎立即恢复、而暂停状态下打开则一直空白,
 * "重开一次"也因重新掷骰子而通常正常。
 * 修复:上方三层防护,其中 ensureLyricApplied 兜底通过 ref 直接校验存活 core 实例
 * (getLyricLines().length)并在缺失时手动 setLyricLines,彻底与绑定层时序解耦。
 */
