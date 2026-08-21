/**
 * 宿主契约层(契约 v2 的 UI 侧实现,见 ./contract.ts)。
 *
 * 职责:
 *   1. 挂载 window.$MeTMusic_* 全局(Data / Hook / 三个控制函数 / registerHost);
 *   2. 播放 tick 时组装 HookPayload 并广播(旧 Player.js updateHookData 的移植,
 *      逐字 percent 计算已抽为 core 的 computeWordProgress);
 *   3. $MeTMusic_registerHost:宿主注册后 UI 判定运行于桌面壳内,
 *      导航栏渲染设置/隐藏按钮(替代 v1 的 DOM 注入)。
 */
import { create } from "zustand";
import { changePlayIndex, computeWordProgress, playOrPause } from "@met/core";
import { CONTRACT_VERSION, type HookPayload, type HostCallbacks } from "./contract";
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
