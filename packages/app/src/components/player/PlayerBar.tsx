import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { useStatusStore, type StatusStoreState } from "../../stores/status";
import { useMusicStore } from "../../stores/music";
import { useSettingsStore } from "../../stores/settings";
import { copyText } from "@/lib/clipboard";
import { formatArtists, getCoverUrl } from "./format";
import PlaylistDrawer from "./PlaylistDrawer";

/** 播放模式循环顺序(对齐旧 MainControl.vue:列表循环 → 随机播放 → 单曲循环) */
const NEXT_SONG_MODE: Record<
  StatusStoreState["playSongMode"],
  StatusStoreState["playSongMode"]
> = {
  normal: "random",
  random: "repeat",
  repeat: "normal",
};

const SONG_MODE_META: Record<StatusStoreState["playSongMode"], { icon: string; label: string }> = {
  normal: { icon: "⇆", label: "列表循环" },
  random: { icon: "⤮", label: "随机播放" },
  repeat: { icon: "↺", label: "单曲循环" },
};

/** 倍速可选项(对照旧倍速滑块 0.1-2,改为常用档位菜单) */
const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

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
  const showPlaylistCount = useSettingsStore((s) => s.showPlaylistCount);

  const navigate = useNavigate();

  /** 拖动中的进度值(0-100);null 表示未在拖动,由 playTimeData.bar 驱动 */
  const [dragBar, setDragBar] = useState<number | null>(null);
  /** 倍速菜单开关 */
  const [rateMenuOpen, setRateMenuOpen] = useState(false);

  const coverUrl = getCoverUrl(playSongData, "s");
  const artistsText = formatArtists(playSongData.artists);
  const modeMeta = SONG_MODE_META[playSongMode];
  const barValue = dragBar ?? (Number(playTimeData.bar) || 0);

  // 底栏歌词:当前歌词行文本(yrc 优先拼接逐字,其次 lrc 整行)
  const lyricLine =
    playSongLyric.hasYrc && showYrc
      ? (playSongLyric.yrc[playSongLyricIndex]?.content ?? [])
          .map((word) => word.content + (word.endsWithSpace ? " " : ""))
          .join("")
      : playSongLyric.lrc[playSongLyricIndex]?.content ?? "";
  // 对齐旧逻辑:开启底栏歌词 && 播放中 && 有当前行 时展示歌词,否则展示歌手
  const showBottomLyric =
    bottomLyricShow && playState && playSongLyricIndex >= 0 && lyricLine.length > 0;

  const commitSeek = (percent: number) => {
    const { duration } = useStatusStore.getState().playTimeData;
    setSeek((percent / 100) * duration);
    setDragBar(null);
  };

  /** 播放模式切换(toast 提示模式名,对齐旧交互) */
  const changeSongMode = () => {
    const next = NEXT_SONG_MODE[playSongMode];
    useStatusStore.setState({ playSongMode: next });
    toast(SONG_MODE_META[next].label);
  };

  /** 倍速切换 */
  const changeRate = (rate: number) => {
    setRate(rate);
    useStatusStore.setState({ playRate: rate });
    setRateMenuOpen(false);
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

  const moreItems: MenuItemDef[] = [
    {
      key: "comment",
      label: "查看评论",
      onSelect: () => void navigate({ to: "/comments", search: { id: String(currentSongId) } }),
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
  ];

  return (
    <div
      className="flex h-[72px] w-full items-center gap-4 border-t px-4"
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
              className="truncate text-xs"
              style={{ color: "var(--met-fg-dim)" }}
            >
              {lyricLine}
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
            className="cursor-pointer bg-transparent text-lg"
            style={{ color: "var(--met-fg)" }}
            title="上一曲"
            onClick={() => void changePlayIndex("prev", true)}
          >
            ⏮
          </button>
          <button
            type="button"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-lg"
            style={{ background: "var(--met-primary)", color: "var(--met-bg)" }}
            title={playState ? "暂停" : "播放"}
            onClick={() => void playOrPause()}
          >
            {playLoading ? (
              <span className="inline-block animate-spin">◌</span>
            ) : playState ? (
              "⏸"
            ) : (
              "▶"
            )}
          </button>
          <button
            type="button"
            className="cursor-pointer bg-transparent text-lg"
            style={{ color: "var(--met-fg)" }}
            title="下一曲"
            onClick={() => void changePlayIndex("next", true)}
          >
            ⏭
          </button>
        </div>
        <div className="flex w-full items-center gap-2">
          <span
            className="w-10 shrink-0 text-right text-xs tabular-nums"
            style={{ color: "var(--met-fg-dim)" }}
          >
            {playTimeData.played}
          </span>
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
        {/* 播放模式 */}
        <button
          type="button"
          className="cursor-pointer bg-transparent text-lg"
          style={{ color: "var(--met-fg)" }}
          title={modeMeta.label}
          onClick={changeSongMode}
        >
          {modeMeta.icon}
        </button>

        {/* 倍速(对齐旧行为:一起听房间内隐藏) */}
        {!isInRoom && (
          <div className="relative">
            <button
              type="button"
              className="cursor-pointer bg-transparent text-xs tabular-nums"
              style={{ color: playRate === 1 ? "var(--met-fg)" : "var(--met-primary)" }}
              title="播放倍速"
              onClick={() => setRateMenuOpen((open) => !open)}
            >
              {playRate === 1 ? "倍速" : `${playRate}x`}
            </button>
            {rateMenuOpen && (
              <>
                {/* 点击外部关闭 */}
                <div
                  className="fixed inset-0 z-20"
                  aria-hidden="true"
                  onClick={() => setRateMenuOpen(false)}
                />
                <div
                  className="absolute bottom-full right-0 z-20 mb-2 w-20 rounded-lg border py-1 shadow-xl"
                  style={{
                    background: "var(--met-bg-elevated)",
                    borderColor: "var(--met-border)",
                  }}
                  role="menu"
                  aria-label="播放倍速"
                >
                  {RATE_OPTIONS.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      role="menuitem"
                      className="block w-full cursor-pointer bg-transparent px-3 py-1.5 text-left text-xs tabular-nums transition-colors hover:bg-[var(--met-bg-hover)]"
                      style={{
                        color: rate === playRate ? "var(--met-primary)" : "var(--met-fg)",
                      }}
                      onClick={() => changeRate(rate)}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 音量 */}
        <button
          type="button"
          className="cursor-pointer bg-transparent text-lg"
          style={{ color: "var(--met-fg)" }}
          title={playVolume > 0 ? "静音" : "取消静音"}
          onClick={() => setVolumeMute()}
        >
          {playVolume > 0 ? "🔊" : "🔇"}
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
          onChange={(e) => {
            const v = Number(e.target.value);
            useStatusStore.setState({ playVolume: v });
            setVolume(v);
          }}
        />

        {/* 更多操作(当前歌曲的评论/详情/下载/复制链接;无当前歌曲或本地歌曲时禁用) */}
        <DropdownMenu
          items={moreItems}
          disabled={moreDisabled}
          side="top"
          align="end"
          ariaLabel="更多操作"
          title="更多操作"
          triggerClassName="bg-transparent text-lg text-[var(--met-fg)]"
        >
          ⋯
        </DropdownMenu>

        {/* 播放列表 */}
        <button
          type="button"
          className="relative cursor-pointer bg-transparent text-lg"
          style={{ color: playListShow ? "var(--met-primary)" : "var(--met-fg)" }}
          title="播放列表"
          onClick={() => useStatusStore.setState({ playListShow: !playListShow })}
        >
          ☰
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

      {/* 播放列表抽屉 */}
      <PlaylistDrawer />
    </div>
  );
}
