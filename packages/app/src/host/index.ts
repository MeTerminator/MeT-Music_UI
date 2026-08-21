/**
 * 宿主契约层(契约 v2 的 UI 侧实现,见 ./contract.ts)。
 *
 * 职责:
 *   1. 挂载 window.$MeTMusic_* 全局(Data / Hook / 三个控制函数 / registerHost);
 *   2. 播放 tick 时组装 HookPayload 并广播(旧 Player.js updateHookData 的移植,
 *      逐字 percent 计算已抽为 core 的 computeWordProgress);
 *   3. $MeTMusic_registerHost:宿主注册后 UI 判定运行于桌面壳内,
 *      导航栏渲染设置/隐藏按钮(替代 v1 的 DOM 注入);
 *   4. 外部 API 支撑函数($MeTMusic_getState / getLyrics / seek / setVolume / stop):
 *      App 的 HTTP / WebSocket 外部接口经 executeJavaScript 调它们取数与控制播放。
 */
import { create } from "zustand";
import {
  changePlayIndex,
  computeWordProgress,
  getSeek,
  playOrPause,
  setSeek,
  setVolume,
  soundStop,
} from "@met/core";
import {
  CONTRACT_VERSION,
  type HookPayload,
  type HostCallbacks,
  type LyricLine,
  type LyricsSnapshot,
  type NowPlaying,
  type PlaybackSnapshot,
} from "./contract";
import { getPlaySongData, useMusicStore } from "@/stores/music";
import { useStatusStore } from "@/stores/status";
import { useSettingsStore } from "@/stores/settings";
import { cleanAll } from "@/platform/web";

/** 宿主注册状态(导航栏据此渲染宿主按钮) */
interface HostState {
  isHosted: boolean;
  callbacks: HostCallbacks | null;
  /** 主窗是否最大化(由宿主经 $MeTMusic_setWindowState 回推,决定最大化/还原图标) */
  windowMaximized: boolean;
}

export const useHostStore = create<HostState>()(() => ({
  isHosted: false,
  callbacks: null,
  windowMaximized: false,
}));

/** 组装 HookPayload(旧 updateHookData 逻辑 + contractVersion 字段) */
export const buildHookPayload = (): HookPayload | null => {
  const status = useStatusStore.getState();
  const music = useMusicStore.getState();
  const settings = useSettingsStore.getState();
  const playSongData = getPlaySongData();
  const playTimeData = status.playTimeData;
  const currentTime = playTimeData.currentTime || 0;

  const songName = playSongData.name || "未知曲目";
  const songMid = playSongData.id || "Unknown";
  const songArtist = Array.isArray(playSongData.artists)
    ? playSongData.artists.map((ar) => ar.name).join(" / ")
    : (playSongData.artists as string) || "未知歌手";

  const theme = status.coverTheme as {
    dark?: Record<string, string | undefined>;
    light?: Record<string, string | undefined>;
  };
  const pickSide = (side?: Record<string, string | undefined>) => ({
    bg: side?.bg,
    mainBg: side?.mainBg,
    primary: side?.primary,
    shade: side?.shade,
    shadeTwo: side?.shadeTwo,
  });

  try {
    // 与引擎同款 lrcType 分支:有逐字歌词且开启逐字显示时用 yrc,否则回退 lrc
    const useYrc = settings.showYrc && music.playSongLyric.hasYrc;
    let lyricText = "";
    let lyricTrans = "";
    let lyricData: ReturnType<typeof computeWordProgress> = [];
    if (useYrc) {
      const lrcData = music.playSongLyric.yrc[status.playSongLyricIndex];
      lyricText = lrcData ? lrcData.content.map((i) => i.content).join("") : "";
      lyricTrans = lrcData ? lrcData.tran ?? "" : "";
      lyricData = computeWordProgress(lrcData, currentTime, settings.lyricsHookOffset);
    } else {
      const lrcLine = music.playSongLyric.lrc[status.playSongLyricIndex];
      lyricText = lrcLine ? lrcLine.content : "";
      lyricTrans = lrcLine ? lrcLine.tran ?? "" : "";
      // 纯 lrc 无逐字数据
      lyricData = [];
    }

    return {
      contractVersion: CONTRACT_VERSION,
      songName,
      songArtist,
      songMid,
      currentTime,
      duration: playTimeData.duration,
      lyricText,
      lyricTrans,
      lyricData,
      coverUrl: playSongData?.coverSize?.l,
      coverTheme: { dark: pickSide(theme.dark), light: pickSide(theme.light) },
      isPlaying: status.playState,
    };
  } catch (error) {
    console.error("$MeTMusic_Data 处理出错：", error);
    return null;
  }
};

/** 播放 tick 广播(经 PlayerDeps.env.onTick 挂入引擎) */
export const broadcastHook = (): void => {
  if (!window.$MeTMusic_Hook) return;
  const payload = buildHookPayload();
  if (!payload) return;
  window.$MeTMusic_Data = payload;
  try {
    window.$MeTMusic_Hook(payload);
  } catch (error) {
    console.error("$MeTMusic_Hook 调用出错：", error);
  }
};

/**
 * 播放状态快照(外部 API 的 GET /api/status 数据源)。
 * 现取 store,不复用 hook payload —— 后者由播放 tick 驱动,暂停后不再刷新。
 */
export const buildPlaybackSnapshot = (): PlaybackSnapshot => {
  const status = useStatusStore.getState();
  const { duration } = status.playTimeData;
  const hasSong = Boolean(getPlaySongData()?.id);
  // 进度取引擎的 getSeek 而非 playTimeData.currentTime:
  // 模拟播放暂停时 setAudioTime 直接 return,currentTime 会停在暂停前那一刻,
  // 此后 seek 也刷不动它;getSeek 两种模式下都返回真实进度。
  const currentTime = Math.max(0, getSeek());
  // 播完停在末尾(下一首尚未开始)也算结束,给外部轮询一个明确信号
  const isFinished = !status.playState && duration > 0 && currentTime >= duration - 0.5;
  return {
    state: !hasSong ? "stopped" : status.playState ? "playing" : "paused",
    position: Math.round(currentTime * 1000),
    duration: Math.round((duration || 0) * 1000),
    volume: status.playVolume,
    isFinished,
  };
};

/**
 * 轻量播放快照(外部 API 的 GET /api/now-playing 数据源)。
 * 在播放状态之上补曲目信息与当前歌词行;歌词正文全量走 buildLyricsSnapshot。
 */
export const buildNowPlaying = (): NowPlaying => {
  const status = useStatusStore.getState();
  const settings = useSettingsStore.getState();
  const lyric = useMusicStore.getState().playSongLyric;
  const song = getPlaySongData();

  const useYrc = settings.showYrc && lyric.hasYrc && lyric.yrc.length > 0;
  const lines: Array<{ content: unknown; tran?: string }> = useYrc ? lyric.yrc : lyric.lrc;
  const line = lines[status.playSongLyricIndex];
  const lyricText = !line
    ? ""
    : Array.isArray(line.content)
      ? (line.content as Array<{ content: string }>).map((word) => word.content).join("")
      : String(line.content ?? "");

  const artists = song?.artists;
  const album = song?.album;

  return {
    ...buildPlaybackSnapshot(),
    id: song?.id ?? "Unknown",
    name: song?.name || "未知曲目",
    artist: Array.isArray(artists)
      ? artists.map((ar) => ar.name).join(" / ")
      : (artists as string) || "未知歌手",
    album: typeof album === "string" ? album : album?.name,
    cover: song?.coverSize?.l ?? song?.cover,
    lyricAvailable: lines.length > 0,
    lyricLineCount: lines.length,
    lyricText,
    lyricTrans: line?.tran ?? "",
  };
};

/**
 * 完整歌词快照(外部 API 的 GET /api/lyrics 数据源)。
 * 与 hook 同款 lrcType 分支:开启逐字且本曲有 yrc 才给 yrc,否则回退 lrc。
 * 时间统一转毫秒(store 内是秒)。
 */
export const buildLyricsSnapshot = (): LyricsSnapshot => {
  const settings = useSettingsStore.getState();
  const lyric = useMusicStore.getState().playSongLyric;
  const offset = Math.round((settings.lyricsOffset || 0) * 1000);
  const toMs = (value: number | undefined): number => Math.round((value || 0) * 1000);

  if (settings.showYrc && lyric.hasYrc && lyric.yrc.length > 0) {
    const lines: LyricLine[] = lyric.yrc.map((line) => ({
      time: toMs(line.time),
      endTime: toMs(line.endTime),
      content: line.content.map((word) => word.content).join(""),
      tran: line.tran,
      roma: line.roma,
      words: line.content.map((word) => ({
        content: word.content,
        start: toMs(word.time),
        end: toMs(word.time + word.duration),
      })),
    }));
    return { source: "yrc", offset, lines };
  }

  if (lyric.lrc.length > 0) {
    const lines: LyricLine[] = lyric.lrc.map((line) => ({
      time: toMs(line.time),
      content: line.content,
      tran: line.tran,
      roma: line.roma,
    }));
    return { source: "lrc", offset, lines };
  }

  return { source: "none", offset, lines: [] };
};

/** 挂载全部宿主契约全局;应用启动时调用一次 */
export const initHostGlobals = (): void => {
  // 暴露给外部脚本(初始为空骨架,与旧 main.js 一致)
  window.$MeTMusic_Data = {
    songName: "",
    songArtist: "",
    songMid: "",
    currentTime: "",
    duration: "",
    lrcContent: "",
    lrcTrans: "",
  };
  window.$MeTMusic_Hook = null;

  window.$MeTMusic_playOrPause = () => {
    playOrPause();
  };
  window.$MeTMusic_next = () => {
    changePlayIndex("next", true);
  };
  window.$MeTMusic_prev = () => {
    changePlayIndex("prev", true);
  };

  /* ---- 外部 API 支撑(见 contract.ts 末尾;宿主判空后调用) ---- */
  // 外部接口的 play / pause 是幂等语义,不能复用「切换」的 playOrPause:
  // 连发两次 play 会把刚播上的歌又暂停掉。状态判定放在 UI 侧(store 即事实)。
  window.$MeTMusic_play = () => {
    if (!useStatusStore.getState().playState) void playOrPause();
  };
  window.$MeTMusic_pause = () => {
    if (useStatusStore.getState().playState) void playOrPause();
  };
  window.$MeTMusic_stop = () => {
    soundStop();
  };
  window.$MeTMusic_seek = (seconds) => {
    if (!Number.isFinite(seconds)) return;
    const { duration } = useStatusStore.getState().playTimeData;
    // 越界的目标进度直接夹到 [0, duration];duration 未知(0)时只保证非负
    const max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
    setSeek(Math.min(Math.max(0, seconds), max));
  };
  window.$MeTMusic_setVolume = (volume) => {
    if (!Number.isFinite(volume)) return;
    const value = Math.min(Math.max(0, volume), 1);
    // 引擎只改 Howler 音量,持久化的 playVolume 得自己同步,否则刷新后回弹
    useStatusStore.setState({ playVolume: value });
    setVolume(value);
  };
  window.$MeTMusic_getState = buildPlaybackSnapshot;
  window.$MeTMusic_getNowPlaying = buildNowPlaying;
  window.$MeTMusic_getLyrics = buildLyricsSnapshot;

  // v2 新增:宿主注册(UI 判定桌面宿主环境的唯一依据)
  window.$MeTMusic_registerHost = (callbacks: HostCallbacks) => {
    useHostStore.setState({ isHosted: true, callbacks });
  };

  // 宿主回推主窗最大化状态(双击拖拽区/系统快捷键改变状态时,UI 靠它对齐图标)
  window.$MeTMusic_setWindowState = (state) => {
    useHostStore.setState({ windowMaximized: Boolean(state?.maximized) });
  };

  // 程序重置
  (window as unknown as { $cleanAll: typeof cleanAll }).$cleanAll = cleanAll;
};
