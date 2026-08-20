import { create } from "zustand";
import { toast } from "sonner";
import {
  ListenTogetherClient,
  createDefaultRoomState,
  computeTargetSeek,
  computeDriftMs,
  initPlayer,
  fadePlayOrPause,
  setSeek,
  getSeek,
  soundStop,
  getPlayerInstance,
} from "@met/core";
import type {
  ListenTogetherBridge,
  Notifier,
  RoomState,
  RoomUser,
  Song,
} from "@met/core";
import formatData from "@/lib/formatData";
import { getAssetUrl, getSessionId } from "@/platform/web";
import { useMusicStore, getPlaySongData } from "./music";
import { useStatusStore } from "./status";
import { useSettingsStore } from "./settings";

/**
 * 一起听歌状态层(对应旧 src/stores/listenTogether.js)。
 *
 * 职责划分:
 * - 协议层(WS 连接/join、消息收发、30s 心跳、10s 时间同步、1s 倒计时、
 *   自动/手动续期及其 10s 冷却)由 @met/core 的 ListenTogetherClient 承担;
 * - 本层负责:状态镜像(zustand)、player 联动(syncPlayerState / syncPlayback /
 *   1s 漂移检查定时器)、与 statusStore 的联动、UI 提示(sonner)。
 */

// ---------------------------------------------------------------- store

export interface ListenTogetherStoreState {
  isInRoom: boolean;
  roomCode: string;
  roomUuid: string;
  /** 房间状态镜像(权威数据在 client;此处供 UI 订阅) */
  roomState: RoomState;
  /** 房间剩余时间(秒) */
  remainingTime: number;
  /** 剩余时间 ≤30 分钟时自动续期(client 内置,连接时生效) */
  autoRenew: boolean;
  /** 手动续期冷却中(自动续期的冷却由 client 内部维护) */
  renewCooldown: boolean;
  userInfo: RoomUser | null;
}

/** 不持久化(与旧 store 一致,pinia 版也未开启 persist) */
export const useListenTogetherStore = create<ListenTogetherStoreState>()(
  (): ListenTogetherStoreState => ({
    isInRoom: false,
    roomCode: "",
    roomUuid: "",
    roomState: createDefaultRoomState(),
    remainingTime: 3600,
    autoRenew: true,
    renewCooldown: false,
    userInfo: null,
  }),
);

// ---------------------------------------------------------------- 模块级实例(不进 store)

let client: ListenTogetherClient | null = null;
let playbackSyncTimer: ReturnType<typeof setInterval> | null = null;
let firstSyncTimer: ReturnType<typeof setTimeout> | null = null;
let renewCooldownTimer: ReturnType<typeof setTimeout> | null = null;

/** UI 反馈(sonner toast 适配 core Notifier) */
const notifier: Notifier = {
  info: (m) => {
    toast(m);
  },
  success: (m) => {
    toast.success(m);
  },
  warning: (m) => {
    toast.warning(m);
  },
  error: (m) => {
    toast.error(m);
  },
};

/** 服务器时间偏移(ms,server - local);未连接时为 0 */
const getServerTimeOffset = (): number => client?.serverTimeOffset ?? 0;

/** 当前房间状态(优先读 client 的权威数据) */
const getRoomState = (): RoomState =>
  client?.roomState ?? useListenTogetherStore.getState().roomState;

// ---------------------------------------------------------------- player 联动

/**
 * 依据房间状态同步本地播放器(旧 syncPlayerState)。
 * @param eventType 触发本次广播的事件名(如 "seek",强制对齐进度)
 */
const syncPlayerState = async (eventType?: string): Promise<void> => {
  const room = getRoomState();

  // 同步共享播放列表与索引
  useMusicStore.setState({ playList: room.playlist });
  useStatusStore.setState({ playIndex: room.current_song_index });

  const currentRoomSong: Song | undefined = room.playlist[room.current_song_index];
  if (currentRoomSong) {
    const localPlaySong = getPlaySongData();

    // 歌曲不同或播放器未初始化:切歌
    if (localPlaySong?.id !== currentRoomSong.id || !getPlayerInstance()) {
      useMusicStore.setState({ playSongData: currentRoomSong });
      await initPlayer(room.is_playing);
    } else {
      // 播放/暂停同步
      const { playState } = useStatusStore.getState();
      if (room.is_playing && !playState) {
        fadePlayOrPause("play");
      } else if (!room.is_playing && playState) {
        fadePlayOrPause("pause");
      }

      // 进度同步:显式 seek 事件或漂移超过阈值时对齐
      const targetSeek = computeTargetSeek(room, getServerTimeOffset(), Date.now());
      const threshold = useSettingsStore.getState().listenTogetherSyncThreshold ?? 300;
      if (eventType === "seek" || computeDriftMs(getSeek(), targetSeek) > threshold) {
        setSeek(targetSeek, true);
      }
    }
  } else {
    // 房间播放列表无歌曲:停止本地播放
    if (useStatusStore.getState().playState || getPlayerInstance()) {
      soundStop();
      useStatusStore.setState({
        playState: false,
        playTimeData: {
          currentTime: 0,
          duration: 0,
          bar: 0,
          played: "00:00",
          durationTime: "00:00",
        },
      });
    }
  }
};

/** 入房后的首次全量同步(旧 syncPlayback) */
export const syncPlayback = async (): Promise<void> => {
  const room = getRoomState();
  const currentRoomSong: Song | undefined = room.playlist[room.current_song_index];
  if (currentRoomSong) {
    useMusicStore.setState({ playList: room.playlist });
    useStatusStore.setState({ playIndex: room.current_song_index });

    const localPlaySong = getPlaySongData();
    // 已是同一首且播放器就绪:强制同步播放状态与进度
    if (localPlaySong?.id === currentRoomSong.id && getPlayerInstance()) {
      const { playState } = useStatusStore.getState();
      if (room.is_playing && !playState) {
        fadePlayOrPause("play");
      } else if (!room.is_playing && playState) {
        fadePlayOrPause("pause");
      }
      setSeek(computeTargetSeek(room, getServerTimeOffset(), Date.now()), true);
    } else {
      useMusicStore.setState({ playSongData: currentRoomSong });
      await initPlayer(true);
    }
  } else {
    toast.warning("共享播放列表为空，无可同步的歌曲");
  }
};

/** 每 1s 播放漂移检查(旧 checkAndSyncPlayback;client 不含此定时器,归本层) */
const checkAndSyncPlayback = (): void => {
  const { isInRoom } = useListenTogetherStore.getState();
  const room = getRoomState();
  if (!isInRoom || !room.is_playing) return;
  if (!getPlayerInstance()) return;

  const currentRoomSong: Song | undefined = room.playlist[room.current_song_index];
  if (!currentRoomSong) return;

  const localPlaySong = getPlaySongData();
  if (localPlaySong?.id !== currentRoomSong.id) return;

  const localSeek = getSeek();
  const targetSeek = computeTargetSeek(room, getServerTimeOffset(), Date.now());
  const diffMs = computeDriftMs(localSeek, targetSeek);
  const threshold = useSettingsStore.getState().listenTogetherSyncThreshold ?? 300;

  if (diffMs > threshold) {
    console.log(
      `[Listen Together] Playback drift: ${diffMs.toFixed(1)}ms > threshold: ${threshold}ms. ` +
        `Adjusting local seek from ${localSeek.toFixed(3)}s to target ${targetSeek.toFixed(3)}s.`,
    );
    setSeek(targetSeek, true);
  }
};

const startPlaybackSyncTimer = (): void => {
  stopPlaybackSyncTimer();
  playbackSyncTimer = setInterval(checkAndSyncPlayback, 1000);
};

const stopPlaybackSyncTimer = (): void => {
  if (playbackSyncTimer) {
    clearInterval(playbackSyncTimer);
    playbackSyncTimer = null;
  }
};

// ---------------------------------------------------------------- actions

/** 本地退出清理(旧 handleLocalExit) */
export const handleLocalExit = (): void => {
  useListenTogetherStore.setState({
    isInRoom: false,
    roomCode: "",
    roomUuid: "",
  });
  useStatusStore.setState({
    isInRoom: false,
    roomCode: "",
    roomUuid: "",
    showPlayBar: true,
  });

  soundStop();

  stopPlaybackSyncTimer();
  if (firstSyncTimer) {
    clearTimeout(firstSyncTimer);
    firstSyncTimer = null;
  }

  // 先置空再销毁,避免 destroy 触发的 onClosed 回调重入
  const c = client;
  client = null;
  c?.destroy();
};

/** 连接房间(旧 connectRoom) */
export const connectRoom = (
  code: string,
  nickname: string,
  userAvatar: string,
  qq: string | number | null | undefined,
  isAnonymous: boolean,
): void => {
  if (client) {
    handleLocalExit();
  }

  const userId = getSessionId();
  const userInfo: RoomUser = {
    nickname: isAnonymous ? "Anonymous" : (nickname || "").trim() || "Anonymous",
    avatar: userAvatar || getAssetUrl("/images/pic/avatar.jpg"),
    qq: isAnonymous ? "" : String(qq || ""),
    is_anonymous: !!isAnonymous,
  };
  useListenTogetherStore.setState({ roomCode: code, userInfo });

  // 自动续期由 client 内置(连接时读取当前开关),本层不重复续期
  const { autoRenew } = useListenTogetherStore.getState();

  let self: ListenTogetherClient | null = null;
  const isCurrent = (): boolean => self !== null && client === self;

  self = new ListenTogetherClient({
    notify: notifier,
    autoRenew,
    events: {
      onOpen: () => {
        if (!isCurrent()) return;
        useStatusStore.setState({ showPlayBar: true, isInRoom: true, roomCode: code });
        useListenTogetherStore.setState({ isInRoom: true });
        // 1s 漂移检查定时器随连接启动(client 不含此定时器)
        startPlaybackSyncTimer();
      },
      onRoomState: (room, event, isFirstState) => {
        if (!isCurrent()) return;
        useListenTogetherStore.setState({ roomState: room, roomUuid: room.uuid });
        useStatusStore.setState({ roomUuid: room.uuid });
        if (isFirstState) {
          // 短暂延迟,等待播放器就绪后再同步
          firstSyncTimer = setTimeout(() => {
            firstSyncTimer = null;
            void syncPlayback();
          }, 300);
        } else {
          void syncPlayerState(event);
        }
      },
      onClosed: () => {
        if (!isCurrent()) return;
        handleLocalExit();
      },
      onExpired: () => {
        if (!isCurrent()) return;
        handleLocalExit();
      },
      onCountdown: (remainingSeconds) => {
        if (!isCurrent()) return;
        useListenTogetherStore.setState({ remainingTime: remainingSeconds });
      },
    },
  });
  client = self;
  self.connect(code, userId, userInfo);
};

/** 主动离开房间(旧 leaveRoom) */
export const leaveRoom = (): void => {
  client?.leaveRoom();
  handleLocalExit();
};

/** 房主解散房间(旧 deleteRoom) */
export const deleteRoom = (): void => {
  client?.deleteRoom();
};

/** 手动续期(旧 renewRoom;HTTP 请求与提示由 client 承担,本层维护冷却镜像) */
export const renewRoom = async (): Promise<void> => {
  if (useListenTogetherStore.getState().renewCooldown || !client) return;

  useListenTogetherStore.setState({ renewCooldown: true });
  if (renewCooldownTimer) clearTimeout(renewCooldownTimer);
  renewCooldownTimer = setTimeout(() => {
    renewCooldownTimer = null;
    useListenTogetherStore.setState({ renewCooldown: false });
  }, 10000);

  await client.renewRoom();
  // client 已更新其内部 roomState.expires_at,刷新镜像供 UI 感知
  if (client) {
    useListenTogetherStore.setState({ roomState: { ...client.roomState } });
  }
};

/** 切换自动续期开关(下次 connectRoom 时传入 client 生效) */
export const setAutoRenew = (value: boolean): void => {
  useListenTogetherStore.setState({ autoRenew: value });
};

/** 添加歌曲到共享播放列表(旧 addSong;格式化责任在本层) */
export const addSong = (song: Song): void => {
  if (!useListenTogetherStore.getState().isInRoom) {
    toast.warning("当前未加入一起听歌房间");
    return;
  }
  if (!client || !client.isConnected) return;

  let formattedSong = song;
  // 缺少 coverSize 或 artists 视为原始歌曲对象,需要格式化
  if (!song.coverSize || !song.artists) {
    try {
      const formattedArray = formatData(song, "song");
      const first = formattedArray?.[0];
      if (first) formattedSong = first;
    } catch (e) {
      console.error("格式化歌曲数据失败:", e);
    }
  }

  client.addSong(formattedSong);
  toast.success(`已成功添加歌曲到队列: ${formattedSong.name}`);
};

/** 移除歌曲(旧 removeSong) */
export const removeSong = (index: number): void => {
  client?.removeSong(index);
};

/** 重排播放列表(旧 reorderPlaylist) */
export const reorderPlaylist = (newPlaylist: Song[]): void => {
  client?.reorderPlaylist(newPlaylist);
};

/** 设置播放模式(旧 setPlayMode) */
export const setPlayMode = (mode: string): void => {
  client?.setPlayMode(mode);
};

/** 更新房间设置(旧 updateSettings) */
export const updateSettingsAction = (
  deleteAfterPlayed: boolean,
  loopPlaylist: boolean,
): void => {
  client?.updateSettings(deleteAfterPlayed, loopPlaylist);
};

/** 播放指定索引(旧 playIndex) */
export const playIndexAction = (index: number): void => {
  client?.playIndex(index);
};

// ---------------------------------------------------------------- 引擎桥接

/**
 * 一起听桥接(注入 core 引擎,替换 player/setup.ts 中的占位实现)。
 * roomState / serverTimeOffset 通过 getter 实时读取 client;
 * 未连接时回退到 store 镜像 / 0,引擎侧无需感知连接状态。
 */
export const ltBridge: ListenTogetherBridge = {
  get roomState(): RoomState {
    return getRoomState();
  },
  get serverTimeOffset(): number {
    return getServerTimeOffset();
  },
  sendNext: (): void => {
    client?.sendNext();
  },
  sendChangeIndex: (type: "next" | "prev"): void => {
    client?.sendChangeIndex(type);
  },
  sendPlayOrPause: (): void => {
    // core client 签名需要当前播放状态:正在播放则发 "pause",否则发 "play"
    client?.sendPlayOrPause(useStatusStore.getState().playState);
  },
  sendSeek: (seconds: number): void => {
    client?.sendSeek(seconds);
  },
};

export default useListenTogetherStore;
