import { useRef, useState, type WheelEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { DropdownMenu, type MenuItemDef } from "@/components/ui/menu";
import { Slider } from "@/components/ui/slider";
import { useStatusStore, type StatusStoreState } from "../../stores/status";
import { useMusicStore } from "../../stores/music";
import { useSettingsStore } from "../../stores/settings";
import { copyText } from "@/lib/clipboard";
import { formatArtists, getCoverUrl } from "./format";
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
 * 由 RootLayout 放置于布局底部;自身高度 72px、宽度 100%。
 * 内部渲染 PlaylistDrawer(受 status.playListShow 驱动)。
 */
export default function PlayerBar() {
  const playState = useStatusStore((s) => s.playState);
  const playLoading = useStatusStore((s) => s.playLoading);
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

  const navigate = useNavigate();

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

  // 「更多操作」菜单(对照旧 MainControl.vue 的 songMoreOptions)
  // 无当前歌曲或为本地歌曲(旧逻辑 v-if="!path")时禁用
  const currentSongId = playSongData?.id;
  const moreDisabled =
    currentSongId == null || currentSongId === "" || !!playSongData?.path;

  /** 复制歌曲分享链接(对照旧「复制歌曲链接」) */
  const copySongLink = () =>
    copyText(
      `https://y.qq.com/n/ryqq/songDetail/${String(currentSongId)}`,
      "复制歌曲链接成功",
    );

  // 当前歌曲 MV id(formatData 的 song.mv 字段;0 / "0" / 空值视为无 MV)
  const rawMv = (playSongData as { mv?: unknown })?.mv;
  const mvId =
    typeof rawMv === "number" && rawMv !== 0
      ? String(rawMv)
      : typeof rawMv === "string" && rawMv !== "" && rawMv !== "0"
        ? rawMv
        : null;

  const moreItems: MenuItemDef[] = [
    {
      key: "comment",
      label: "查看评论",
      onSelect: () => void navigate({ to: "/comments", search: { id: String(currentSongId) } }),
    },
    {
      key: "original-page",
      label: "查看原始页面",
      onSelect: () => {
        window.open(`https://y.qq.com/n/ryqq/songDetail/${String(currentSongId)}`);
      },
    },
    {
      key: "song-detail",
      label: "查看单曲详情",
      onSelect: () => void navigate({ to: "/song", search: { id: String(currentSongId) } }),
    },
    {
      key: "download",
      label: "下载歌曲",
      onSelect: () => void navigate({ to: "/download", search: { id: String(currentSongId) } }),
    },
    {
      key: "share",
      label: "复制歌曲链接",
      onSelect: () => void copySongLink(),
    },
    {
      key: "copy-id",
      label: "复制歌曲 ID",
      onSelect: () => void copyText(String(currentSongId), "复制歌曲 ID 成功"),
    },
  ];
  // 观看 MV(对照旧 SongListDropdown 的「观看 MV」;有 MV 时插入到「查看评论」之后)
  if (mvId) {
    moreItems.splice(1, 0, {
      key: "mv",
      label: "观看 MV",
      onSelect: () => void navigate({ to: "/videos-player", search: { id: mvId } }),
    });
  }

  return (
    <>
    {/* showPlayBar=false 时向下平移全隐(对照旧 bottom -90 动画;
        transform 会让 fixed 后代以其为包含块,故 PlaylistDrawer 置于本节点之外) */}
    <div
      className={`flex h-[72px] w-full items-center gap-4 border-t px-4 transition-transform duration-300 ${
        showPlayBar ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
      aria-hidden={!showPlayBar}
      style={{
        background: "var(--met-bg-elevated)",
        borderColor: "var(--met-border)",
      }}
    >
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
              className="lyric-font truncate text-xs"
              style={{ color: "var(--met-fg-dim)" }}
            >
              {/* 逐字动画开启时 KTV 染色(已唱主题色 / 未唱暗色),否则整行文本 */}
              {yrcLine && showYrcAnimation ? (
                <KtvLine
                  line={yrcLine}
                  activeColor="var(--met-primary)"
                  inactiveColor="var(--met-fg-dim)"
                />
              ) : (
                lyricLine
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

      {/* 中区:控制按钮 + 进度条 */}
      <div className="flex w-[420px] max-w-[46%] flex-col items-center gap-1">
        <div className="flex items-center gap-4">
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
            style={{ background: "var(--met-primary)", color: "var(--met-bg)" }}
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
        <div className="flex w-full items-center gap-2">
          <span
            className="w-10 shrink-0 text-right text-xs tabular-nums"
            style={{ color: "var(--met-fg-dim)" }}
          >
            {playTimeData.played}
          </span>
          <SeekTooltipArea className="w-full" dragPercent={dragBar} variant="bar">
            <input
              type="range"
              className="w-full cursor-pointer"
              style={{ accentColor: "var(--met-primary)" }}
              min={0}
              max={100}
              step={0.1}
              value={barValue}
              aria-label="播放进度"
              onChange={(e) => setDragBar(Number(e.target.value))}
              onPointerUp={(e) => commitSeek(Number(e.currentTarget.value))}
              onKeyUp={(e) => {
                if (dragBar !== null) commitSeek(Number(e.currentTarget.value));
              }}
            />
          </SeekTooltipArea>
          <span
            className="w-10 shrink-0 text-xs tabular-nums"
            style={{ color: "var(--met-fg-dim)" }}
          >
            {playTimeData.durationTime}
          </span>
        </div>
      </div>

      {/* 右区:播放模式 + 倍速 + 音量 + 播放列表 */}
      <div className="flex flex-1 items-center justify-end gap-3">
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
                className="w-28 rounded-lg border py-1 shadow-xl"
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
                  className="flex w-56 items-center gap-3 rounded-lg border px-3 py-2 shadow-xl"
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
        <input
          type="range"
          className="w-24 cursor-pointer"
          style={{ accentColor: "var(--met-primary)" }}
          min={0}
          max={1}
          step={0.01}
          value={playVolume}
          aria-label="音量"
          onWheel={handleVolumeWheel}
          onChange={(e) => {
            const v = Number(e.target.value);
            useStatusStore.setState({ playVolume: v });
            setVolume(v);
          }}
        />
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
          className="relative cursor-pointer bg-transparent"
          style={{ color: playListShow ? "var(--met-primary)" : "var(--met-fg)" }}
          title="播放列表"
          onClick={() => useStatusStore.setState({ playListShow: !playListShow })}
        >
          <ListMusic size={18} aria-hidden="true" />
          {showPlaylistCount && playList.length > 0 && (
            <span
              className="absolute -top-1.5 -right-3 rounded-full px-1.5 py-px text-[10px] leading-4 tabular-nums"
              style={{
                background: "var(--met-bg-hover)",
                color: "var(--met-primary)",
              }}
            >
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
