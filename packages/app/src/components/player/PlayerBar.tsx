import { useRef, useState, type WheelEvent } from "react";
import {
  Ellipsis,
  Gauge,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  changePlayIndex,
  playOrPause,
  setRate,
  setSeek,
  setVolume,
  setVolumeMute,
} from "@met/core";
import { DropdownMenu } from "@/components/ui/menu";
import { Slider } from "@/components/ui/slider";
import { useStatusStore, type StatusStoreState } from "../../stores/status";
import { useMusicStore } from "../../stores/music";
import { useSettingsStore } from "../../stores/settings";
import { formatArtists, getCoverUrl } from "./format";
import CacheProgressBar from "./CacheProgress";
import { useSongMoreItems } from "./songMenu";
import PlaylistDrawer from "./PlaylistDrawer";
import SeekTooltipArea from "./SeekTooltip";
import KtvLine from "./KtvLine";

/** 播放模式循环顺序(对齐旧 MainControl.vue:列表循环 → 随机播放 → 单曲循环) */
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

/** 播放模式列表(hover 弹层直接选,顺序对齐 NEXT_SONG_MODE 循环) */
const SONG_MODE_ORDER: readonly StatusStoreState["playSongMode"][] = [
  "normal",
  "random",
  "repeat",
];

/**
 * 音量四档图标(对照旧 MainControl.vue:
 * 0 静音 / (0,0.4) 低 / [0.4,0.7) 中 / [0.7,1] 高)。
 */
const getVolumeIcon = (volume: number): LucideIcon =>
  volume === 0 ? VolumeX : volume < 0.4 ? Volume : volume < 0.7 ? Volume1 : Volume2;

/** 音量滚轮 ±5%(对照旧 changeVolume:clamp 0-1,写 store 并同步播放器) */
const handleVolumeWheel = (e: WheelEvent) => {
  const cur = useStatusStore.getState().playVolume;
  const next =
    Math.round(Math.min(1, Math.max(0, cur + (e.deltaY > 0 ? -0.05 : 0.05))) * 100) / 100;
  useStatusStore.setState({ playVolume: next });
  setVolume(next);
};

/**
 * 底部播放条(U3:对齐旧 MainControl.vue 功能)。
 * 由 RootLayout 放置于布局底部;宽度 100%,桌面高 72px。
 * 窄屏(max-md)改为上下两行(对齐 Apple Music 迷你播放器):
 * 第一行 封面/歌曲信息 + 紧凑控制(播放·下一曲·播放列表),第二行 进度条;
 * 放不下的次要控件(播放模式/倍速/音量/更多)在窄屏隐藏,统一去全屏播放器操作。
 * 高度随之变为 96px,RootLayout 的内容留白与回顶按钮偏移同步走 max-md 分支。
 * 内部渲染 PlaylistDrawer(受 status.playListShow 驱动)。
 */
export default function PlayerBar() {
  const playState = useStatusStore((s) => s.playState);
  const playLoading = useStatusStore((s) => s.playLoading);
  const songCacheProgress = useStatusStore((s) => s.songCacheProgress);
  const playTimeData = useStatusStore((s) => s.playTimeData);
  const playSongMode = useStatusStore((s) => s.playSongMode);
  const playVolume = useStatusStore((s) => s.playVolume);
  const playRate = useStatusStore((s) => s.playRate);
  const playListShow = useStatusStore((s) => s.playListShow);
  const playSongLyricIndex = useStatusStore((s) => s.playSongLyricIndex);
  const isInRoom = useStatusStore((s) => s.isInRoom);
  const playSongData = useMusicStore((s) => s.playSongData);
  const playList = useMusicStore((s) => s.playList);
  const playSongLyric = useMusicStore((s) => s.playSongLyric);
  const bottomLyricShow = useSettingsStore((s) => s.bottomLyricShow);
  const showYrc = useSettingsStore((s) => s.showYrc);
  const showYrcAnimation = useSettingsStore((s) => s.showYrcAnimation);
  const showPlaylistCount = useSettingsStore((s) => s.showPlaylistCount);

  const showPlayBar = useStatusStore((s) => s.showPlayBar);

  /** 拖动中的进度值(0-100);null 表示未在拖动,由 playTimeData.bar 驱动 */
  const [dragBar, setDragBar] = useState<number | null>(null);
  /** 倍速滑块 hover 弹层开关 */
  const [rateOpen, setRateOpen] = useState(false);
  /** 播放模式 hover 弹层开关 */
  const [modeOpen, setModeOpen] = useState(false);

  const coverUrl = getCoverUrl(playSongData, "s");
  const artistsText = formatArtists(playSongData.artists);
  const modeMeta = SONG_MODE_META[playSongMode];
  const VolumeIcon = getVolumeIcon(playVolume);
  const barValue = dragBar ?? (Number(playTimeData.bar) || 0);
  /** 正在为「音乐资源自动缓存」下载整首歌(-1 表示没有在下载) */
  const caching = songCacheProgress >= 0;

  // 底栏歌词:当前逐字行(showYrc 时优先)与整行文本回退
  const yrcLine =
    playSongLyric.hasYrc && showYrc ? playSongLyric.yrc[playSongLyricIndex] : undefined;
  const lyricLine = yrcLine
    ? yrcLine.content
        .map((word) => word.content + (word.endsWithSpace ? " " : ""))
        .join("")
    : playSongLyric.lrc[playSongLyricIndex]?.content ?? "";
  // 对齐旧逻辑:开启底栏歌词 && 播放中 && 有当前行 时展示歌词,否则展示歌手(暂停回退歌手)
  const showBottomLyric =
    bottomLyricShow && playState && playSongLyricIndex >= 0 && lyricLine.length > 0;

  const commitSeek = (percent: number) => {
    const { duration } = useStatusStore.getState().playTimeData;
    setSeek((percent / 100) * duration);
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

  /** 播放模式切换(toast 提示模式名,对齐旧交互) */
  const changeSongMode = () => {
    const next = NEXT_SONG_MODE[playSongMode];
    useStatusStore.setState({ playSongMode: next });
    toast(SONG_MODE_META[next].label);
  };

  /** hover 弹层直接选择播放模式(对照旧 n-dropdown trigger=hover) */
  const selectSongMode = (mode: StatusStoreState["playSongMode"]) => {
    useStatusStore.setState({ playSongMode: mode });
    toast(SONG_MODE_META[mode].label);
    setModeOpen(false);
  };

  /** 倍速调整(连续滑块 0.1-2;写 store 并同步播放器) */
  const changeRate = (rate: number) => {
    const next = Math.round(rate * 100) / 100;
    setRate(next);
    useStatusStore.setState({ playRate: next });
  };

  // 「更多操作」菜单(与全屏播放器共用同一份定义)
  const { items: moreItems, disabled: moreDisabled } = useSongMoreItems(playSongData);

  return (
    <>
    {/* showPlayBar=false 时向下平移全隐(对照旧 bottom -90 动画;
        transform 会让 fixed 后代以其为包含块,故 PlaylistDrawer 置于本节点之外) */}
    <div
      className={`flex h-[72px] w-full items-center gap-4 border-t px-4 transition-transform duration-300 max-md:h-[96px] max-md:flex-col max-md:items-stretch max-md:justify-center max-md:gap-1.5 max-md:px-3 ${
        showPlayBar ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
      aria-hidden={!showPlayBar}
      style={{
        background: "var(--met-bg-elevated)",
        borderColor: "var(--met-border)",
      }}
    >
      {/* 窄屏第一行:歌曲信息 + 紧凑控制;md+ 用 display:contents 还原为原来的直接子元素 */}
      <div className="flex min-w-0 items-center gap-3 md:contents">
      {/* 左区:封面 + 歌曲信息,点击打开全屏播放器 */}
      <div
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
        role="button"
        tabIndex={0}
        title="打开播放器"
        onClick={() => useStatusStore.setState({ showFullPlayer: true })}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            useStatusStore.setState({ showFullPlayer: true });
          }
        }}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="封面"
            className="h-12 w-12 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div
            className="h-12 w-12 shrink-0 rounded-md"
            style={{ background: "var(--met-border)" }}
          />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm" style={{ color: "var(--met-fg)" }}>
            {playSongData.name || "未在播放"}
          </div>
          {/* 副标题:播放中且开启底栏歌词时显示当前歌词行,否则显示歌手 */}
          {showBottomLyric ? (
            <div
              key={playSongLyricIndex}
              className="met-lyric-in lyric-font text-xs"
              style={{ color: "var(--met-fg-dim)" }}
            >
              {/* 逐字动画开启时 KTV 染色(已唱主题色 / 未唱暗色),否则整行文本。
                  逐字行走 autoScroll:整行超宽时横向滚动,当前字保持居中
                  (故此处不能再套 truncate,由 KtvLine 自己 overflow-hidden) */}
              {yrcLine && showYrcAnimation ? (
                <KtvLine
                  line={yrcLine}
                  activeColor="var(--met-primary)"
                  inactiveColor="var(--met-fg-dim)"
                  autoScroll
                />
              ) : (
                <div className="truncate">{lyricLine}</div>
              )}
            </div>
          ) : (
            artistsText && (
              <div className="truncate text-xs" style={{ color: "var(--met-fg-dim)" }}>
                {artistsText}
              </div>
            )
          )}
        </div>
      </div>

      {/* 窄屏紧凑控制:播放/暂停 + 下一曲 + 播放列表(其余控件收进全屏播放器) */}
      <div className="flex shrink-0 items-center gap-1 md:hidden">
        <button
          type="button"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full"
          style={{ background: "var(--met-primary)", color: "var(--met-primary-fg)" }}
          title={playState ? "暂停" : "播放"}
          onClick={() => void playOrPause()}
        >
          {playLoading ? (
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          ) : playState ? (
            <Pause size={18} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play size={18} fill="currentColor" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="flex h-9 w-9 cursor-pointer items-center justify-center bg-transparent"
          style={{ color: "var(--met-fg)" }}
          title="下一曲"
          onClick={() => switchSong("next")}
        >
          <SkipForward size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="flex h-9 cursor-pointer items-center gap-1 bg-transparent px-1"
          style={{ color: playListShow ? "var(--met-primary)" : "var(--met-fg)" }}
          title="播放列表"
          onClick={() => useStatusStore.setState({ playListShow: !playListShow })}
        >
          <ListMusic size={18} aria-hidden="true" />
          {showPlaylistCount && playList.length > 0 && (
            <span
              className="text-[11px] leading-4 tabular-nums"
              style={{ color: "var(--met-fg-dim)" }}
            >
              {playList.length > 999 ? "999+" : playList.length}
            </span>
          )}
        </button>
      </div>
      </div>

      {/* 中区:控制按钮 + 进度条(窄屏为第二行,只留进度条) */}
      <div className="flex w-[420px] max-w-[46%] flex-col items-center gap-1 max-md:w-full max-md:max-w-none">
        <div className="flex items-center gap-4 max-md:hidden">
          <button
            type="button"
            className="cursor-pointer bg-transparent"
            style={{ color: "var(--met-fg)" }}
            title="上一曲"
            onClick={() => switchSong("prev")}
          >
            <SkipBack size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full"
            style={{ background: "var(--met-primary)", color: "var(--met-primary-fg)" }}
            title={playState ? "暂停" : "播放"}
            onClick={() => void playOrPause()}
          >
            {playLoading ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : playState ? (
              <Pause size={18} fill="currentColor" aria-hidden="true" />
            ) : (
              <Play size={18} fill="currentColor" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="cursor-pointer bg-transparent"
            style={{ color: "var(--met-fg)" }}
            title="下一曲"
            onClick={() => switchSong("next")}
          >
            <SkipForward size={18} aria-hidden="true" />
          </button>
        </div>
        {/* 缓存下载中:进度条临时充当下载进度显示器(此时还没有可用的播放进度) */}
        {caching ? (
          <CacheProgressBar percent={songCacheProgress} variant="bar" />
        ) : (
          <div className="flex w-full items-center gap-2">
            <span
              className="w-10 shrink-0 text-right text-xs tabular-nums"
              style={{ color: "var(--met-fg-dim)" }}
            >
              {playTimeData.played}
            </span>
            <SeekTooltipArea className="w-full" dragPercent={dragBar} variant="bar">
              <Slider
                value={barValue}
                min={0}
                max={100}
                step={0.1}
                ariaLabel="播放进度"
                onValueChange={setDragBar}
                onValueCommitted={commitSeek}
              />
            </SeekTooltipArea>
            <span
              className="w-10 shrink-0 text-xs tabular-nums"
              style={{ color: "var(--met-fg-dim)" }}
            >
              {playTimeData.durationTime}
            </span>
          </div>
        )}
      </div>

      {/* 右区:播放模式 + 倍速 + 音量 + 播放列表(窄屏放不下,统一去全屏播放器操作) */}
      <div className="flex flex-1 items-center justify-end gap-3 max-md:hidden">
        {/* 播放模式(点击循环切换;hover 弹出三项直接选,对照旧 n-dropdown) */}
        <div
          className="relative flex items-center"
          onMouseEnter={() => setModeOpen(true)}
          onMouseLeave={() => setModeOpen(false)}
        >
          <button
            type="button"
            className="cursor-pointer bg-transparent"
            style={{ color: "var(--met-fg)" }}
            title={modeMeta.label}
            onClick={changeSongMode}
          >
            <modeMeta.icon size={18} aria-hidden="true" />
          </button>
          {modeOpen && (
            /* 外层 pb-2 补住按钮与弹层间隙,避免 hover 穿越间隙时闪关 */
            <div className="absolute bottom-full right-0 z-20 pb-2">
              <div
                className="met-pop-in-up w-28 rounded-lg border py-1 shadow-xl"
                style={{
                  background: "var(--met-bg-elevated)",
                  borderColor: "var(--met-border)",
                }}
                role="menu"
                aria-label="播放模式"
              >
                {SONG_MODE_ORDER.map((mode) => {
                  const meta = SONG_MODE_META[mode];
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="menuitem"
                      className="flex w-full cursor-pointer items-center gap-2 bg-transparent px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--met-bg-hover)]"
                      style={{
                        color: mode === playSongMode ? "var(--met-primary)" : "var(--met-fg)",
                      }}
                      onClick={() => selectSongMode(mode)}
                    >
                      <meta.icon size={14} aria-hidden="true" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 倍速(对齐旧行为:一起听房间内隐藏;hover 弹出连续滑块,点击一键重置 1x) */}
        {!isInRoom && (
          <div
            className="relative flex items-center"
            onMouseEnter={() => setRateOpen(true)}
            onMouseLeave={() => setRateOpen(false)}
          >
            <button
              type="button"
              className="flex cursor-pointer items-center bg-transparent text-xs tabular-nums"
              style={{ color: playRate === 1 ? "var(--met-fg)" : "var(--met-primary)" }}
              title="播放倍速(点击重置 1x)"
              onClick={() => changeRate(1)}
            >
              {playRate === 1 ? (
                <Gauge size={18} aria-hidden="true" />
              ) : (
                `${playRate.toFixed(2)}x`
              )}
            </button>
            {rateOpen && (
              /* 外层 pb-2 补住按钮与弹层间隙,避免 hover 穿越间隙时闪关 */
              <div className="absolute bottom-full right-0 z-20 pb-2">
                <div
                  className="met-pop-in-up flex w-56 items-center gap-3 rounded-lg border px-3 py-2 shadow-xl"
                  style={{
                    background: "var(--met-bg-elevated)",
                    borderColor: "var(--met-border)",
                  }}
                  aria-label="播放倍速调整"
                >
                  <div className="min-w-0 flex-1">
                    <Slider
                      value={playRate}
                      min={0.1}
                      max={2}
                      step={0.05}
                      onValueChange={changeRate}
                    />
                  </div>
                  <span
                    className="w-11 shrink-0 text-right text-xs tabular-nums"
                    style={{ color: "var(--met-fg-dim)" }}
                  >
                    {playRate.toFixed(2)}x
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 音量(图标四档;图标与滑杆滚轮 ±5%;滑杆旁百分比读数) */}
        <button
          type="button"
          className="cursor-pointer bg-transparent"
          style={{ color: "var(--met-fg)" }}
          title={playVolume > 0 ? "静音" : "取消静音"}
          onClick={() => setVolumeMute()}
          onWheel={handleVolumeWheel}
        >
          <VolumeIcon size={18} aria-hidden="true" />
        </button>
        <div className="w-24" onWheel={handleVolumeWheel}>
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
        <span
          className="w-9 shrink-0 text-right text-xs tabular-nums"
          style={{ color: "var(--met-fg-dim)" }}
        >
          {Math.round(playVolume * 100)}%
        </span>

        {/* 更多操作(当前歌曲的评论/详情/下载/复制链接;无当前歌曲或本地歌曲时禁用) */}
        <DropdownMenu
          items={moreItems}
          disabled={moreDisabled}
          side="top"
          align="end"
          ariaLabel="更多操作"
          title="更多操作"
          triggerClassName="flex items-center bg-transparent text-[var(--met-fg)]"
        >
          <Ellipsis size={18} aria-hidden="true" />
        </DropdownMenu>

        {/* 播放列表 */}
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 bg-transparent"
          style={{ color: playListShow ? "var(--met-primary)" : "var(--met-fg)" }}
          title="播放列表"
          onClick={() => useStatusStore.setState({ playListShow: !playListShow })}
        >
          <ListMusic size={18} aria-hidden="true" />
          {/* 数量与图标并排(角标形式会盖住图标本体) */}
          {showPlaylistCount && playList.length > 0 && (
            <span className="text-[11px] leading-4 tabular-nums" style={{ color: "var(--met-fg-dim)" }}>
              {playList.length > 999 ? "999+" : playList.length}
            </span>
          )}
        </button>
      </div>

    </div>

    {/* 播放列表抽屉(fixed 定位,须置于带 transform 的播放条节点之外) */}
    <PlaylistDrawer />
    </>
  );
}
