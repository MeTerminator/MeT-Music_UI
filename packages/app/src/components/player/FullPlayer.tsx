import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BackgroundRender,
  LyricPlayer,
  type LyricPlayerRef,
} from "@applemusic-like-lyrics/react";
import type { LyricLineMouseEvent } from "@applemusic-like-lyrics/core";
import "@applemusic-like-lyrics/core/style.css";
import { ChevronDown, Ellipsis, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { fadePlayOrPause, setSeek, type AMLine, type Artist } from "@met/core";
import { useStatusStore } from "../../stores/status";
import { useMusicStore } from "../../stores/music";
import { useSettingsStore } from "../../stores/settings";
import type { OnCoverColors } from "@/platform/cover-color";
import { useIsMobile, useIsTouch } from "@/platform/use-media-query";
import { DropdownMenu } from "@/components/ui/menu";
import { formatArtists } from "./format";
import FullPlayerControls from "./FullPlayerControls";
import LyricScroll from "./LyricScroll";
import PlayerCover from "./PlayerCover";
import { useSongMoreItems } from "./songMenu";

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

/** status.coverTheme 消费视角(onCover 见 platform/cover-color.ts) */
interface CoverThemeShape {
  light?: CoverThemeSide;
  dark?: CoverThemeSide;
  onCover?: Partial<OnCoverColors>;
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

/** 窄屏顶部条图标按钮(封面主题色前景 + 轻触反馈) */
const mobileIconBtnCls =
  "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-[rgba(var(--fp-main-rgb),0.75)] transition-colors active:bg-[rgba(var(--fp-main-rgb),0.14)]";

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
  // Apple Music 式抽屉过渡:打开从底部滑入(CSS animation,挂载即自动播放,
  // 不依赖 rAF/JS 时序),关闭用 transition 下收、transitionend 后才卸载
  // (mounted 延迟到退场结束,保证 Inner 的副作用最终仍随卸载清理)
  const [mounted, setMounted] = useState(showFullPlayer);

  useEffect(() => {
    if (showFullPlayer) {
      setMounted(true);
      return;
    }
    // 退场兜底:transitionend 意外缺失(标签页后台等)时也要完成卸载
    const timer = window.setTimeout(() => setMounted(false), 600);
    return () => window.clearTimeout(timer);
  }, [showFullPlayer]);

  if (!mounted) return null;
  return (
    <div
      className={`met-fp-in fixed inset-0 z-40 transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
        showFullPlayer ? "" : "translate-y-full"
      }`}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && !useStatusStore.getState().showFullPlayer) {
          setMounted(false);
        }
      }}
    >
      <FullPlayerInner />
    </div>
  );
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
  const lyricsShiftMs = useSettingsStore((s) => s.lyricsShiftMs);
  const lyricsAMEndTimeOffset = useSettingsStore((s) => s.lyricsAMEndTimeOffset);
  const useAMSpring = useSettingsStore((s) => s.useAMSpring);
  const useAMScale = useSettingsStore((s) => s.useAMScale);
  const lyricsFontSize = useSettingsStore((s) => s.lyricsFontSize);
  const lyricsBlur = useSettingsStore((s) => s.lyricsBlur);
  const lyricsBlock = useSettingsStore((s) => s.lyricsBlock);

  /** 窄屏(<768px)走两页式手机布局,与桌面左右分栏 DOM 结构不同,故用 JS 断点分支 */
  const isMobile = useIsMobile();
  /**
   * 触屏设备(含 >= 768px 走桌面布局的平板):没有 mousemove 可唤出控制条,
   * 一旦淡出就再也回不来,故这类设备一律不做「静止 2 秒自动隐藏」。
   */
  const isTouch = useIsTouch();

  // ===== 窄屏两页分页(横向 scroll-snap;0=封面页,1=歌词页) =====
  const pagerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const onPagerScroll = useCallback(() => {
    const el = pagerRef.current;
    if (!el || el.clientWidth <= 0) return;
    setPage(el.scrollLeft > el.clientWidth / 2 ? 1 : 0);
  }, []);
  const goPage = useCallback((index: number) => {
    const el = pagerRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  }, []);

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

  // 浏览器全屏状态:全屏时隐藏顶部关闭钮(对照旧 FullPlayer.vue v-if="!screenfullStatus")
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    Boolean(document.fullscreenElement),
  );
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

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
    hideTimerRef.current = null;
    // 触屏没有「鼠标静止」可言,也没有 mousemove 能把控制条唤回来,故常驻
    if (isTouch || isMobile) return;
    hideTimerRef.current = window.setTimeout(() => {
      useStatusStore.setState({ playerControlShow: false });
    }, 2000);
  }, [isTouch, isMobile]);

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
    const startMs = e.line.getLine().startTime;
    setSeek(startMs / 1000);
    // 暂停态点击恢复播放(对齐 LyricScroll 路径;房内不本地起播)
    const status = useStatusStore.getState();
    if (!status.playState && !status.isInRoom) fadePlayOrPause("play");
    // AMLL 靠连续的时间推进重排;seek(尤其暂停态)必须显式立即对位,
    // 否则滚动停留在旧行、当前行落在视界之外,视觉上"歌词消失",
    // 直到自然行进两三行后才自行校正。
    //
    // 交给库自带的 seek 通路即可:setCurrentTime(ms, isSeek=true) 内部会
    // 重算 scrollToIndex(pickScrollToIndexForSeek)、resetScroll(清掉用户
    // 手动滚动的偏移),再自行 calcLayout() —— 不带 force,走 seek 专用的
    // 弹簧参数(stiffness 90 / damping 15)平滑滚到目标行。
    // 这里千万不能再补一发 calcLayout(_, force=true):force 会让每行绕过
    // 弹簧直接 setPosition,表现就是歌词"闪现"到目标位置。
    // 动画的逐帧 update 由 react 绑定的 rAF 循环负责(只受 disabled 影响,
    // 与 playing 无关),故暂停态点击同样是平滑过渡。
    lyricPlayerRef.current?.lyricPlayer?.setCurrentTime(startMs, true);
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

  // 切到无歌词的歌曲时第二页随之卸载(滚动位置由浏览器夹回 0),页码状态一并复位
  useEffect(() => {
    if (!hasLyric) setPage(0);
  }, [hasLyric]);

  // currentTime 偏移修正(对齐旧 AMLyric.vue 三元):仅 TTML 歌词且开启
  // lyricsAMttmlUseOffset 时叠加 lyricsAMOffset,其余路径用原始 playSeekMs
  const applyAMOffset = useTtml && lyricsAMttmlUseOffset;
  // 歌词时间平移(控制条上的 -10ms / +10ms):正值让歌词整体延后,故扣减当前时间
  const amCurrentTime = Math.max(
    0,
    Math.round((applyAMOffset ? playSeekMs + lyricsAMOffset : playSeekMs) - lyricsShiftMs),
  );

  // 歌词时间平移变更后立即对位:AMLL 暂停时不自行推进时间轴,
  // 不显式 setCurrentTime 就要等下一次播放才看得出平移效果。
  const shiftSyncedRef = useRef(true);
  useEffect(() => {
    if (shiftSyncedRef.current) {
      shiftSyncedRef.current = false;
      return;
    }
    const core = lyricPlayerRef.current?.lyricPlayer;
    if (!core) return;
    const seekMs = useStatusStore.getState().playSeekMs;
    const time = Math.max(
      0,
      Math.round((applyAMOffset ? seekMs + lyricsAMOffset : seekMs) - lyricsShiftMs),
    );
    core.setCurrentTime(time, true);
    void core.calcLayout(true, true);
    core.update();
  }, [lyricsShiftMs, applyAMOffset, lyricsAMOffset]);

  // 缺陷 B 兜底:LyricPlayer 挂载/歌词变化后,校验 core 实例已持有歌词,缺失则补写
  useEffect(() => {
    if (!lyricReady || !useAM || amLines.length === 0) return;
    const timer = window.setTimeout(() => {
      const core = lyricPlayerRef.current?.lyricPlayer;
      if (!core || core.getLyricLines().length === amLines.length) return;
      const seekMs = useStatusStore.getState().playSeekMs;
      const time = Math.max(
        0,
        Math.round((applyAMOffset ? seekMs + lyricsAMOffset : seekMs) - lyricsShiftMs),
      );
      core.setLyricLines(amLines, time);
      core.setCurrentTime(time, true);
      void core.calcLayout(true, true);
      core.update();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [lyricReady, useAM, amLines, applyAMOffset, lyricsAMOffset, lyricsShiftMs]);

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
  // 背景恒为偏深的封面模糊/动效,前景取语义化的 onCover 组(与站点明暗无关);
  // 旧持久化的 coverTheme 无 onCover 字段,回退 light.shadeTwo(旧
  // --cover-main-color 同源,同为浅色调),再回退白色系
  const theme = coverTheme as CoverThemeShape | undefined;
  const mainRgb = theme?.onCover?.main || theme?.light?.shadeTwo || "255, 255, 255";
  const primaryRgb = theme?.onCover?.accent || theme?.light?.primary || "255, 255, 255";
  const amLyricColor = `rgba(${mainRgb}, 0.95)`; // 对照旧 AMLyric.vue 109-112

  // ===== 全屏歌手/专辑跳转(对照旧 FullPlayer.vue 66-99 行) =====
  // record 唱片模式下歌词区高度 70vh(对照旧 AMLyric.vue getDynamicHeight)
  const lyricHeightCls = playCoverType === "record" ? "h-[70vh]" : "h-[86%]";

  // 「更多操作」菜单(窄屏顶部条;与控制条同一份定义,跳转前先收起全屏播放器)
  const { items: moreItems, disabled: moreDisabled } = useSongMoreItems(playSongData, {
    beforeNavigate: () => useStatusStore.setState({ showFullPlayer: false }),
  });

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

  // ===== 背景层(桌面/窄屏共用;按 settings.playerBackgroundType 分支) =====
  const backgroundNode = (
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
  );

  /**
   * 歌词本体(桌面/窄屏共用):自身撑满,高度由外层容器决定。
   * AM 歌词字号在窄屏收窄(设置项默认 46px 是给桌面大屏的,手机上会溢出)。
   */
  const lyricNode = !hasLyric ? null : useAM ? (
    <div
      className="relative h-full w-full overflow-hidden"
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
              fontSize: `${
                isMobile ? Math.max(18, Math.min(lyricsFontSize, 28)) : lyricsFontSize
              }px`,
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
    <LyricScroll />
  );

  /**
   * 歌曲信息块(标题 / 别名 / 歌手 / 专辑)。
   * 歌手与专辑带 id 时可点跳转(对照旧 FullPlayer.vue 66-99 行);
   * 桌面居中大字,窄屏两页各用不同紧凑度,故字号类由调用方传入。
   */
  const renderSongInfo = ({
    className = "",
    titleCls,
    aliaCls,
    artistCls,
    albumCls,
  }: {
    className?: string;
    titleCls: string;
    aliaCls: string;
    artistCls: string;
    /** null 表示该处不显示专辑行(窄屏歌词页顶部信息栏) */
    albumCls: string | null;
  }) => (
    <div className={className}>
      <div
        className={`truncate font-bold ${titleCls}`}
        style={{ color: "rgb(var(--fp-main-rgb))" }}
      >
        {playSongData.name || "未知曲目"}
      </div>
      {aliaText && (
        <div
          className={`truncate ${aliaCls}`}
          style={{ color: "rgba(var(--fp-main-rgb), 0.6)" }}
        >
          {aliaText}
        </div>
      )}
      {/* 歌手:有 id 时可点跳转 /artist */}
      <div
        className={`truncate ${artistCls}`}
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
      {albumCls !== null && albumText && (
        <div
          className={`truncate ${albumCls}`}
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
  );

  const rootStyle = {
    background: "var(--met-bg)",
    // 局部主题色变量(对照旧 --cover-main-color / --cover-second-color)
    "--fp-main-rgb": mainRgb,
    "--fp-primary-rgb": primaryRgb,
  } as CSSProperties;

  // ===================== 窄屏(手机)两页式布局,参考 Apple Music =====================
  // 第一页:大封面 + 歌曲信息;第二页:左上小封面 + 右上歌曲信息 + 下方歌词。
  // 横向 scroll-snap 分页(原生惯性/回弹,无需手写拖拽),底部圆点可点跳页;
  // 控制条常驻在分页区之下(不参与横向滚动)。
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-40 flex select-none flex-col overflow-hidden"
        style={rootStyle}
      >
        <style>{FULL_PLAYER_CSS}</style>
        {backgroundNode}

        {/* 顶部条:收起 + 抓手 + 更多操作 */}
        <div className="relative z-20 flex shrink-0 items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
          <button
            type="button"
            className={mobileIconBtnCls}
            title="收起播放器"
            aria-label="收起播放器"
            onClick={() => useStatusStore.setState({ showFullPlayer: false })}
          >
            <ChevronDown size={22} aria-hidden="true" />
          </button>
          <span
            className="h-1 w-9 rounded-full bg-[rgba(var(--fp-main-rgb),0.35)]"
            aria-hidden
          />
          <DropdownMenu
            items={moreItems}
            disabled={moreDisabled}
            side="bottom"
            align="end"
            ariaLabel="更多操作"
            title="更多操作"
            triggerClassName={mobileIconBtnCls}
          >
            <Ellipsis size={22} aria-hidden="true" />
          </DropdownMenu>
        </div>

        {/* 分页区(无歌词时只有第一页,不显示圆点) */}
        <div
          ref={pagerRef}
          onScroll={onPagerScroll}
          className="relative z-10 flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* 第一页:封面 + 歌曲信息 */}
          <section className="flex h-full w-full min-w-full shrink-0 snap-center flex-col items-center justify-center gap-7 px-8">
            <PlayerCover
              className={
                playCoverType === "record"
                  ? "max-w-[min(72vw,300px)]"
                  : "max-w-[min(76vw,340px)]"
              }
            />
            {renderSongInfo({
              className: "w-full text-center",
              titleCls: "text-xl",
              aliaCls: "mt-1 text-sm",
              artistCls: "mt-1.5 text-sm",
              albumCls: "mt-1 text-xs",
            })}
          </section>

          {/* 第二页:顶部左封面 + 右信息,下方歌词 */}
          {hasLyric && (
            <section className="flex h-full w-full min-w-full shrink-0 snap-center flex-col px-5">
              <div className="flex shrink-0 items-center gap-3 pb-2">
                {coverSmall ? (
                  <img
                    src={coverSmall}
                    alt="封面"
                    className="h-14 w-14 shrink-0 rounded-lg object-cover shadow-lg"
                  />
                ) : (
                  <div
                    className="h-14 w-14 shrink-0 rounded-lg"
                    style={{ background: "rgba(255, 255, 255, 0.08)" }}
                  />
                )}
                {renderSongInfo({
                  className: "min-w-0 flex-1 text-left",
                  titleCls: "text-base",
                  aliaCls: "text-xs",
                  artistCls: "mt-0.5 text-xs",
                  albumCls: null,
                })}
              </div>
              <div className="min-h-0 flex-1">{lyricNode}</div>
            </section>
          )}
        </div>

        {/* 页码圆点(点按跳页) */}
        {hasLyric && (
          <div className="relative z-20 flex shrink-0 items-center justify-center gap-2 py-2">
            {[0, 1].map((i) => (
              <button
                key={i}
                type="button"
                className={`h-1.5 cursor-pointer rounded-full p-0 transition-all ${
                  page === i
                    ? "w-5 bg-[rgba(var(--fp-main-rgb),0.9)]"
                    : "w-1.5 bg-[rgba(var(--fp-main-rgb),0.35)]"
                }`}
                aria-label={i === 0 ? "封面页" : "歌词页"}
                aria-current={page === i}
                onClick={() => goPage(i)}
              />
            ))}
          </div>
        )}

        <FullPlayerControls onKeepVisible={keepControlsVisible} mobile />
      </div>
    );
  }

  // ===================== 桌面(md+)左右分栏布局 =====================
  return (
    <div
      className="fixed inset-0 z-40 select-none overflow-hidden"
      style={{ ...rootStyle, cursor: playerControlShow ? "auto" : "none" }}
      onMouseMove={pokeControls}
      // 触屏设备不挂 mouseleave:模拟出的 mouseleave 会把控制条藏掉,
      // 而没有 mousemove 能再把它唤回来
      onMouseLeave={isTouch ? undefined : hideControls}
    >
      <style>{FULL_PLAYER_CSS}</style>
      {backgroundNode}

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
        {/* 浏览器全屏时隐藏(对照旧 FullPlayer.vue 顶部 n-icon v-if="!screenfullStatus") */}
        {!isFullscreen && (
          <button
            type="button"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-lg text-[rgba(var(--fp-main-rgb),0.7)] transition-all hover:scale-105 hover:bg-[rgba(var(--fp-main-rgb),0.14)] hover:text-[rgb(var(--fp-main-rgb))]"
            title="关闭播放器 (Esc)"
            onClick={() => useStatusStore.setState({ showFullPlayer: false })}
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* ===== 主体:左封面 + 右歌词 ===== */}
      <div className="relative z-10 flex h-full w-full items-center">
        {/* 左半:大封面 + 歌曲信息(纯净歌词模式下隐藏) */}
        {!purelyLyric && (
          <div
            className={`flex h-full flex-col items-center justify-center gap-6 px-10 ${
              hasLyric ? "w-[45%]" : "w-full"
            }`}
          >
            {/* 封面(cover/record 两种模式,见 PlayerCover) */}
            <PlayerCover
              className={
                playCoverType === "record" ? "max-w-[min(46vh,420px)]" : "max-w-[420px]"
              }
            />
            {renderSongInfo({
              className: "w-full max-w-[420px] text-center",
              titleCls: "text-2xl",
              aliaCls: "mt-1 text-base",
              artistCls: "mt-2 text-sm",
              albumCls: "mt-1 text-sm",
            })}
          </div>
        )}

        {/* 右半:歌词区(纯净模式下占满居中) */}
        {/* record 唱片模式歌词区高度 70vh(对照旧 AMLyric.vue getDynamicHeight 76-84) */}
        {hasLyric && (
          <div
            className={`flex h-full min-w-0 flex-col justify-center ${
              purelyLyric ? "w-full px-[12%]" : "flex-1 pr-10"
            }`}
          >
            <div className={`${lyricHeightCls} w-full`}>{lyricNode}</div>
          </div>
        )}
      </div>

      {/* ===== 底部:悬浮控制条 ===== */}
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
