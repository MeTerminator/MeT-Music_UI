import { useEffect, useRef, useState, type WheelEvent } from "react";
import {
  ChevronDown,
  Ellipsis,
  ListMusic,
  MessageSquare,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  Settings,
  SkipBack,
  SkipForward,
  Video,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import { changePlayIndex, playOrPause, setSeek, setVolume, setVolumeMute } from "@met/core";
import { useStatusStore, type StatusStoreState } from "../../stores/status";
import { useMusicStore } from "../../stores/music";
import { useSettingsStore } from "../../stores/settings";
import { DropdownMenu } from "../ui/menu";
import { Slider } from "../ui/slider";
import CacheProgressBar from "./CacheProgress";
import SeekTooltipArea from "./SeekTooltip";
import { useSongMoreItems } from "./songMenu";

/** 歌词时间平移的单次步进(ms)与上下限 */
const LYRIC_SHIFT_STEP = 10;
const LYRIC_SHIFT_LIMIT = 5000;

/** 播放模式循环顺序(与 PlayerBar 保持一致) */
const NEXT_SONG_MODE: Record<
  StatusStoreState["playSongMode"],
  StatusStoreState["playSongMode"]
> = {
  normal: "random",
  random: "repeat",
  repeat: "normal",
};

const SONG_MODE_META: Record<
  StatusStoreState["playSongMode"],
  { icon: LucideIcon; label: string }
> = {
  normal: { icon: Repeat, label: "列表循环" },
  random: { icon: Shuffle, label: "随机播放" },
  repeat: { icon: Repeat1, label: "单曲循环" },
};

/**
 * 音量四档图标(与 PlayerBar 一致,对照旧 MainControl.vue:
 * 0 静音 / (0,0.4) 低 / [0.4,0.7) 中 / [0.7,1] 高)。
 */
const getVolumeIcon = (volume: number): LucideIcon =>
  volume === 0 ? VolumeX : volume < 0.4 ? Volume : volume < 0.7 ? Volume1 : Volume2;

/** 音量滚轮 ±5%(与 PlayerBar 一致,对照旧 changeVolume:clamp 0-1) */
const handleVolumeWheel = (e: WheelEvent) => {
  const cur = useStatusStore.getState().playVolume;
  const next =
    Math.round(Math.min(1, Math.max(0, cur + (e.deltaY > 0 ? -0.05 : 0.05))) * 100) / 100;
  useStatusStore.setState({ playVolume: next });
  setVolume(next);
};

export interface FullPlayerControlsProps {
  /** 悬停控制条时保持其可见(清除父级 2 秒隐藏计时器) */
  onKeepVisible: () => void;
  /**
   * 窄屏(手机)版:常驻在两页分页区之下的流内控制条,
   * 只保留 进度 + 模式/上一曲/播放/下一曲/播放列表(其余去顶部「更多」)。
   */
  mobile?: boolean;
}

/**
 * 全屏播放器底部悬浮控制条(对齐旧 PlayerControl.vue):
 * 进度 Slider + 上一曲/播放暂停/下一曲 + 播放模式 + 音量 + 全屏 + 关闭。
 * 窄屏(max-md)下隐藏播放模式与音量等次要控件,保留核心播放控制。
 * 随 status.playerControlShow 淡入淡出(鼠标静止 2 秒后由 FullPlayer 隐藏)。
 */
export default function FullPlayerControls({
  onKeepVisible,
  mobile = false,
}: FullPlayerControlsProps) {
  const playerControlShow = useStatusStore((s) => s.playerControlShow);
  const playState = useStatusStore((s) => s.playState);
  const playLoading = useStatusStore((s) => s.playLoading);
  const songCacheProgress = useStatusStore((s) => s.songCacheProgress);
  const playTimeData = useStatusStore((s) => s.playTimeData);
  const playSongMode = useStatusStore((s) => s.playSongMode);
  const playVolume = useStatusStore((s) => s.playVolume);
  const playListShow = useStatusStore((s) => s.playListShow);
  const playSongData = useMusicStore((s) => s.playSongData);
  const lyricsShiftMs = useSettingsStore((s) => s.lyricsShiftMs);

  /** 拖动中的进度(0-100);null 表示未拖动,由 playTimeData.bar 驱动 */
  const [dragBar, setDragBar] = useState<number | null>(null);
  const barValue = dragBar ?? (Number(playTimeData.bar) || 0);
  /** 正在为「音乐资源自动缓存」下载整首歌(-1 表示没有在下载) */
  const caching = songCacheProgress >= 0;
  const modeMeta = SONG_MODE_META[playSongMode];
  const ModeIcon = modeMeta.icon;
  const VolumeIcon = getVolumeIcon(playVolume);

  // ===== 浏览器全屏(原生 Fullscreen API,对齐旧 screenfullChange 职责) =====
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    () => Boolean(document.fullscreenElement),
  );

  // fullscreenchange 同步按钮状态(含 Esc / F11 等浏览器自行退出的场景)
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      // 关闭播放器时若仍处于浏览器全屏,一并退出,避免遗留全屏页面
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };

  const commitSeek = (percent: number) => {
    const { duration } = useStatusStore.getState().playTimeData;
    if (duration) setSeek((percent / 100) * duration);
    setDragBar(null);
  };

  /** 上下曲 300ms 防抖(对照旧 MainControl.vue changePlayIndexDebounce:重复点击忽略) */
  const lastSwitchRef = useRef(0);
  const switchSong = (type: "prev" | "next") => {
    const now = Date.now();
    if (now - lastSwitchRef.current < 300) return;
    lastSwitchRef.current = now;
    void changePlayIndex(type, true);
  };

  // 「更多操作」菜单(与底部播放条同一份定义;站内跳转前先收起全屏播放器)
  const {
    items: moreItems,
    disabled: moreDisabled,
    mvId,
    go,
    songId,
  } = useSongMoreItems(playSongData, {
    beforeNavigate: () => useStatusStore.setState({ showFullPlayer: false }),
  });

  /** 歌词时间平移:+ 让歌词整体延后,- 让歌词提前(步进 10ms,上下限 ±5s) */
  const shiftLyric = (delta: number): void => {
    const next = Math.min(
      LYRIC_SHIFT_LIMIT,
      Math.max(-LYRIC_SHIFT_LIMIT, useSettingsStore.getState().lyricsShiftMs + delta),
    );
    useSettingsStore.setState({ lyricsShiftMs: next });
  };

  const iconBtnCls =
    "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-transparent text-white/80 transition-all hover:scale-105 hover:bg-white/10 hover:text-white active:scale-100";

  // ===== 窄屏(手机)控制条:参与流内布局,不做悬浮卡片、不自动淡出 =====
  if (mobile) {
    const mobileBtnCls =
      "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-white/85 transition-colors active:bg-white/10";
    return (
      <div className="relative z-20 w-full shrink-0 px-6 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-1">
        {/* 进度(缓存下载中时临时充当下载进度显示器) */}
        {caching ? (
          <CacheProgressBar percent={songCacheProgress} variant="overlay" />
        ) : (
          <>
            <SeekTooltipArea className="w-full" dragPercent={dragBar} variant="overlay">
              <Slider
                value={barValue}
                min={0}
                max={100}
                step={0.1}
                ariaLabel="播放进度"
                onValueChange={(v) => setDragBar(v)}
                onValueCommitted={commitSeek}
              />
            </SeekTooltipArea>
            {/* 时间读数移到进度条下方两端(横排放不下) */}
            <div className="flex items-center justify-between px-1 text-[11px] tabular-nums text-white/55">
              <span>{playTimeData.played}</span>
              <span>{playTimeData.durationTime}</span>
            </div>
          </>
        )}

        {/* 播放控制:模式 / 上一曲 / 播放暂停 / 下一曲 / 播放列表 */}
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            className={mobileBtnCls}
            title={modeMeta.label}
            aria-label={modeMeta.label}
            onClick={() =>
              useStatusStore.setState({ playSongMode: NEXT_SONG_MODE[playSongMode] })
            }
          >
            <ModeIcon size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={mobileBtnCls}
            title="上一曲"
            aria-label="上一曲"
            onClick={() => switchSong("prev")}
          >
            <SkipBack size={26} fill="currentColor" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-transform active:scale-95"
            style={{ background: "rgba(255, 255, 255, 0.16)" }}
            title={playState ? "暂停" : "播放"}
            aria-label={playState ? "暂停" : "播放"}
            onClick={() => void playOrPause()}
          >
            {playLoading ? (
              <Loader2 size={28} className="animate-spin" aria-hidden="true" />
            ) : playState ? (
              <Pause size={28} fill="currentColor" aria-hidden="true" />
            ) : (
              <Play size={28} fill="currentColor" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={mobileBtnCls}
            title="下一曲"
            aria-label="下一曲"
            onClick={() => switchSong("next")}
          >
            <SkipForward size={26} fill="currentColor" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={mobileBtnCls}
            style={playListShow ? { color: "var(--met-primary)" } : undefined}
            title="播放列表"
            aria-label="播放列表"
            onClick={() => useStatusStore.setState({ playListShow: !playListShow })}
          >
            <ListMusic size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`absolute bottom-0 left-0 z-20 w-full transition-opacity duration-300 ${
        playerControlShow ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      onMouseEnter={onKeepVisible}
      onMouseMove={(e) => {
        // 停留在控制条上时保持显示,不让根节点重启 2 秒隐藏计时(对齐旧 controlEnter/controlMove)
        e.stopPropagation();
        onKeepVisible();
      }}
    >
      <div
        className="mx-auto mb-6 flex w-[min(880px,94%)] flex-col gap-1 rounded-2xl px-6 py-3"
        style={{ background: "rgba(0, 0, 0, 0.35)", backdropFilter: "blur(24px)" }}
      >
        {/* 进度条(缓存下载中时临时充当下载进度显示器) */}
        {caching ? (
          <CacheProgressBar percent={songCacheProgress} variant="overlay" />
        ) : (
          <div className="flex items-center gap-3 text-xs tabular-nums text-white/60">
            <span className="shrink-0">{playTimeData.played}</span>
            <SeekTooltipArea className="w-full" dragPercent={dragBar} variant="overlay">
              <Slider
                value={barValue}
                min={0}
                max={100}
                step={0.1}
                onValueChange={(v) => setDragBar(v)}
                onValueCommitted={commitSeek}
              />
            </SeekTooltipArea>
            <span className="shrink-0">{playTimeData.durationTime}</span>
          </div>
        )}

        {/* 控制按钮行(两侧列自适应,中间播放控制固定宽度居中) */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          {/* 左区:播放模式 + 音量(与右区功能钮左右配重;窄屏隐藏次要控件,保核心播放控制) */}
          <div className="flex items-center justify-start gap-1">
            <button
              type="button"
              className={`${iconBtnCls} text-lg max-md:hidden`}
              title={modeMeta.label}
              onClick={() =>
                useStatusStore.setState({ playSongMode: NEXT_SONG_MODE[playSongMode] })
              }
            >
              <ModeIcon size={20} aria-hidden="true" />
            </button>
            {/* 查看评论 / 观看 MV(跳转前收起全屏播放器) */}
            <button
              type="button"
              className={`${iconBtnCls} max-md:hidden disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-transparent`}
              title="查看评论"
              disabled={moreDisabled}
              onClick={() => go("/comments", songId)}
            >
              <MessageSquare size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${iconBtnCls} max-md:hidden disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-transparent`}
              title={mvId ? "观看 MV" : "该歌曲暂无 MV"}
              disabled={!mvId}
              onClick={() => mvId && go("/videos-player", mvId)}
            >
              <Video size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${iconBtnCls} max-md:hidden`}
              title={playVolume > 0 ? "静音" : "取消静音"}
              onClick={() => setVolumeMute()}
              onWheel={handleVolumeWheel}
            >
              <VolumeIcon size={20} aria-hidden="true" />
            </button>
            <div className="w-24 max-md:hidden" onWheel={handleVolumeWheel}>
              <Slider
                value={playVolume}
                min={0}
                max={1}
                step={0.01}
                ariaLabel="音量"
                onValueChange={(v) => {
                  useStatusStore.setState({ playVolume: v });
                  setVolume(v);
                }}
              />
            </div>
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-white/60 max-md:hidden">
              {Math.round(playVolume * 100)}%
            </span>
          </div>

          {/* 中区:上一曲 / 播放暂停 / 下一曲 */}
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              className={`${iconBtnCls} rounded-full text-xl`}
              title="上一曲"
              onClick={() => switchSong("prev")}
            >
              <SkipBack size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-xl text-white transition-transform hover:scale-105 active:scale-100"
              style={{ background: "rgba(255, 255, 255, 0.16)" }}
              title={playState ? "暂停" : "播放"}
              onClick={() => void playOrPause()}
            >
              {playLoading ? (
                <Loader2 size={20} className="animate-spin" aria-hidden="true" />
              ) : playState ? (
                <Pause size={20} aria-hidden="true" />
              ) : (
                <Play size={20} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className={`${iconBtnCls} rounded-full text-xl`}
              title="下一曲"
              onClick={() => switchSong("next")}
            >
              <SkipForward size={20} aria-hidden="true" />
            </button>
          </div>

          {/* 右区:歌词平移 + 更多操作 + 设置 + 播放列表 + 全屏 + 关闭 */}
          <div className="flex items-center justify-end gap-1">
            {/* 歌词时间平移:-10ms / +10ms,中间读数点按可归零(窄屏隐藏) */}
            <div
              className="flex items-center gap-0.5 rounded-lg bg-white/5 px-1 py-0.5 max-md:hidden"
              aria-label="歌词时间平移"
            >
              <button
                type="button"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-transparent text-xs tabular-nums text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                title="歌词提前 10ms"
                onClick={() => shiftLyric(-LYRIC_SHIFT_STEP)}
              >
                -10
              </button>
              <button
                type="button"
                className="min-w-[52px] cursor-pointer bg-transparent text-center text-[11px] tabular-nums text-white/50 transition-colors hover:text-white"
                title="歌词时间平移(点击归零)"
                onClick={() => useSettingsStore.setState({ lyricsShiftMs: 0 })}
              >
                {lyricsShiftMs > 0 ? `+${lyricsShiftMs}` : lyricsShiftMs}ms
              </button>
              <button
                type="button"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-transparent text-xs tabular-nums text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                title="歌词延后 10ms"
                onClick={() => shiftLyric(LYRIC_SHIFT_STEP)}
              >
                +10
              </button>
            </div>

            {/* 更多操作(与底部播放条一致:评论 / MV / 详情 / 下载 / 复制链接) */}
            <DropdownMenu
              items={moreItems}
              disabled={moreDisabled}
              side="top"
              align="end"
              ariaLabel="更多操作"
              title="更多操作"
              triggerClassName={iconBtnCls}
              onOpenChange={(open) => open && onKeepVisible()}
            >
              <Ellipsis size={20} aria-hidden="true" />
            </DropdownMenu>

            {/* 全局设置(悬浮层 z-50,盖在全屏播放器之上,无需先收起) */}
            <button
              type="button"
              className={iconBtnCls}
              title="全局设置"
              onClick={() => useStatusStore.setState({ showSettingsPanel: true })}
            >
              <Settings size={20} aria-hidden="true" />
            </button>

            <button
              type="button"
              className={iconBtnCls}
              style={playListShow ? { color: "var(--met-primary)" } : undefined}
              title="播放列表"
              onClick={() => useStatusStore.setState({ playListShow: !playListShow })}
            >
              <ListMusic size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={iconBtnCls}
              title={isFullscreen ? "退出全屏" : "进入全屏"}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? (
                <Minimize2 size={20} aria-hidden="true" />
              ) : (
                <Maximize2 size={20} aria-hidden="true" />
              )}
            </button>
            {/* 浏览器全屏时隐藏收起钮(对照旧 PlayerControl:全屏下先退全屏) */}
            {!isFullscreen && (
              <button
                type="button"
                className={iconBtnCls}
                title="关闭播放器"
                onClick={() => useStatusStore.setState({ showFullPlayer: false })}
              >
                <ChevronDown size={20} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
