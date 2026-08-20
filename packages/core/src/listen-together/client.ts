/**
 * 一起听歌 WebSocket 协议客户端(框架无关)。
 * 从旧 src/stores/listenTogether.js 抽取:仅承担协议层(连接、消息收发、
 * 心跳、时间同步、倒计时/续期);播放器联动(syncPlayerState / syncPlayback)
 * 留在应用层,通过 LTClientEvents 回调驱动。
 *
 * 【播放漂移检查】旧 store 的 checkAndSyncPlayback(每 1s 对比本地播放进度
 * 与目标进度并纠偏)依赖 player,不在本 client 中实现。应用层应自建 1s
 * 定时器,配合 sync.ts 的 computeTargetSeek / computeDriftMs 使用:
 *
 *   setInterval(() => {
 *     const target = computeTargetSeek(client.roomState, client.serverTimeOffset, Date.now());
 *     if (computeDriftMs(player.getSeek(), target) > threshold) player.setSeek(target, true);
 *   }, 1000);
 */
import type { Notifier } from "../types/notify";
import type { Song } from "../types/song";
import type {
  ClientAction,
  ClientActionMessage,
  RoomState,
  RoomUser,
  ServerMessage,
} from "./types";
import { createDefaultRoomState } from "./types";
import { computeServerTimeOffset } from "./sync";

/** WebSocket.OPEN */
const WS_OPEN = 1;

/**
 * 最小 WebSocket 接口(便于测试与非浏览器环境注入)。
 * 标准 WebSocket 满足此结构。
 */
export interface WSLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((err: unknown) => void) | null;
}

export interface LTClientEvents {
  onOpen?(): void;
  onRoomState?(room: RoomState, event: string | undefined, isFirstState: boolean): void;
  /** 服务端 error 消息 */
  onError?(message: string): void;
  onClosed?(code: number, reason: string): void;
  onCountdown?(remainingSeconds: number): void;
  /** 倒计时归零 */
  onExpired?(): void;
  onTimeSynced?(offsetMs: number, rttMs: number): void;
}

export interface ListenTogetherClientOptions {
  /** WS 基地址(如 "wss://example.com")。缺省由 location 推导(wss/ws + host) */
  wsBase?: string;
  /** HTTP 基地址。缺省 ""(相对路径 /api/room/...) */
  httpBase?: string;
  notify?: Notifier;
  events?: LTClientEvents;
  /** 剩余时间 ≤30 分钟时自动续期,默认 true */
  autoRenew?: boolean;
  /** WebSocket 工厂(测试/非浏览器环境注入),缺省 new WebSocket(url) */
  wsFactory?: (url: string) => WSLike;
}

const defaultWsBase = (): string => {
  if (typeof location !== "undefined") {
    const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${location.host}`;
  }
  return "";
};

export class ListenTogetherClient {
  private readonly wsBase: string;
  private readonly httpBase: string;
  private readonly notify: Notifier | undefined;
  private readonly events: LTClientEvents;
  private autoRenew: boolean;
  private readonly wsFactory: (url: string) => WSLike;

  private ws: WSLike | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private syncTimeTimer: ReturnType<typeof setInterval> | null = null;
  private renewCooldownTimer: ReturnType<typeof setTimeout> | null = null;
  private renewCooldown = false;

  private roomCode = "";
  private userId = "";
  private userInfo: RoomUser | null = null;
  private _expectingFirstState = false;

  private _roomState: RoomState = createDefaultRoomState();
  private _serverTimeOffset = 0; // offset = server_time - local_time (ms)
  private _remainingTime = 3600; // 秒

  constructor(opts: ListenTogetherClientOptions = {}) {
    this.wsBase = opts.wsBase ?? defaultWsBase();
    this.httpBase = opts.httpBase ?? "";
    this.notify = opts.notify;
    this.events = opts.events ?? {};
    this.autoRenew = opts.autoRenew ?? true;
    this.wsFactory =
      opts.wsFactory ?? ((url: string) => new WebSocket(url) as unknown as WSLike);
  }

  // ---------------------------------------------------------------- 只读访问器

  get roomState(): RoomState {
    return this._roomState;
  }

  /** 服务器时间偏移(ms,server - local) */
  get serverTimeOffset(): number {
    return this._serverTimeOffset;
  }

  get isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WS_OPEN;
  }

  /** 房间剩余时间(秒,由倒计时定时器维护) */
  get remainingTime(): number {
    return this._remainingTime;
  }

  /** 运行期切换自动续期(下一个倒计时 tick 生效) */
  setAutoRenew(value: boolean): void {
    this.autoRenew = value;
  }

  // ---------------------------------------------------------------- 连接管理

  /** 连接房间并发送 join */
  connect(code: string, userId: string, userInfo: RoomUser): void {
    if (this.ws) {
      this.handleLocalExit();
    }

    this.roomCode = code;
    this.userId = userId;
    this.userInfo = userInfo;
    this._expectingFirstState = true;

    const wsUrl = `${this.wsBase}/api/room/ws/${code}`;
    const ws = this.wsFactory(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      const joinPayload: ClientActionMessage = {
        action: "join",
        userId: this.userId,
        user: this.userInfo ?? undefined,
      };
      ws.send(JSON.stringify(joinPayload));
      this.startTimers();
      this.events.onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as ServerMessage;
        if (payload.type === "room_state") {
          const isFirstState = this._expectingFirstState;
          this._expectingFirstState = false;
          payload.room.receivedAt = Date.now();
          payload.room.serverTime =
            payload.server_time || Date.now() + this._serverTimeOffset;
          this._roomState = payload.room;
          this.events.onRoomState?.(payload.room, payload.event, isFirstState);
        } else if (payload.type === "error") {
          this.notify?.error(payload.message);
          this.events.onError?.(payload.message);
        }
      } catch (e) {
        console.error("解析WS消息失败:", e);
      }
    };

    ws.onclose = (event) => {
      this.handleLocalExit();
      if (event.code === 4004) {
        this.notify?.warning("房间已过期或被关闭");
      } else if (event.reason) {
        this.notify?.info(event.reason);
      }
      this.events.onClosed?.(event.code, event.reason);
    };

    ws.onerror = (err) => {
      console.error("[ListenTogetherClient] WS Error:", err);
      this.notify?.error("连接网络发生错误");
    };
  }

  /** 主动离开房间 */
  leaveRoom(): void {
    if (this.ws) {
      try {
        this.ws.close(1000, "User left the room");
      } catch (_) {
        /* noop */
      }
    }
    this.handleLocalExit();
  }

  /** 清理一切(定时器、连接、冷却) */
  destroy(): void {
    this.handleLocalExit();
    if (this.renewCooldownTimer) {
      clearTimeout(this.renewCooldownTimer);
      this.renewCooldownTimer = null;
    }
    this.renewCooldown = false;
  }

  // ---------------------------------------------------------------- 发送方法

  private sendMessage(
    action: ClientAction,
    data?: Record<string, unknown>,
    withUser = true,
  ): void {
    if (!this.ws || this.ws.readyState !== WS_OPEN) return;
    const msg: ClientActionMessage = {
      action,
      userId: this.userId,
    };
    if (withUser && this.userInfo) msg.user = this.userInfo;
    if (data !== undefined) msg.data = data;
    this.ws.send(JSON.stringify(msg));
  }

  /** 播放/暂停切换:当前正在播放则发 "pause",否则发 "play" */
  sendPlayOrPause(currentlyPlaying: boolean): void {
    this.sendMessage(currentlyPlaying ? "pause" : "play");
  }

  sendChangeIndex(type: "next" | "prev"): void {
    this.sendMessage(type === "next" ? "next" : "prev");
  }

  sendSeek(seconds: number): void {
    this.sendMessage("seek", { currentTime: seconds });
  }

  sendNext(): void {
    this.sendMessage("next");
  }

  /** 添加歌曲。song 须为已格式化的歌曲对象(格式化责任在调用方) */
  addSong(song: Song): void {
    this.sendMessage("playlist_add", { song });
  }

  removeSong(index: number): void {
    this.sendMessage("playlist_remove", { index });
  }

  reorderPlaylist(list: Song[]): void {
    this.sendMessage("playlist_reorder", { playlist: list });
  }

  setPlayMode(mode: string): void {
    this.sendMessage("set_play_mode", { play_mode: mode });
  }

  updateSettings(deleteAfterPlayed: boolean, loopPlaylist: boolean): void {
    this.sendMessage("update_settings", {
      settings: {
        delete_after_played: deleteAfterPlayed,
        loop_playlist: loopPlaylist,
      },
    });
  }

  playIndex(index: number): void {
    this.sendMessage("play_index", { index });
  }

  deleteRoom(): void {
    this.sendMessage("delete_room");
  }

  // ---------------------------------------------------------------- HTTP

  /**
   * 房间续期(含 10s 冷却)。
   * @returns 成功 true;冷却中(静默)或请求失败(已提示)返回 false
   */
  async renewRoom(): Promise<boolean> {
    if (this.renewCooldown) return false;
    try {
      this.renewCooldown = true;
      this.renewCooldownTimer = setTimeout(() => {
        this.renewCooldown = false;
        this.renewCooldownTimer = null;
      }, 10000);

      const response = await fetch(`${this.httpBase}/api/room/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: this.roomCode }),
      });
      const data = (await response.json()) as {
        status?: string;
        expires_at?: number;
        detail?: string;
      };
      if (data && data.status === "ok" && typeof data.expires_at === "number") {
        this._roomState.expires_at = data.expires_at;
        this.notify?.success("房间已成功续期 1 小时");
        return true;
      }
      this.notify?.error(data?.detail || "续期失败");
      return false;
    } catch (err) {
      console.error("续期出错:", err);
      return false;
    }
  }

  /** SNTP 同步本地与服务器系统时间 */
  private async syncSystemTime(): Promise<void> {
    try {
      const t0 = Date.now();
      const response = await fetch(`${this.httpBase}/api/room/time`);
      if (!response.ok) throw new Error("Fetch server time failed");
      const data = (await response.json()) as { server_time: number };
      const t1 = Date.now();
      this._serverTimeOffset = computeServerTimeOffset(t0, t1, data.server_time);
      this.events.onTimeSynced?.(this._serverTimeOffset, t1 - t0);
    } catch (err) {
      console.error("[ListenTogetherClient] Failed to sync server time:", err);
    }
  }

  // ---------------------------------------------------------------- 定时器组

  private startTimers(): void {
    this.stopTimers();

    // 立即同步系统时间,之后每 10s 一次
    void this.syncSystemTime();
    this.syncTimeTimer = setInterval(() => {
      void this.syncSystemTime();
    }, 10000);

    // 每 1s 倒计时
    this.countdownTimer = setInterval(() => {
      const now = Date.now();
      const expiresAt = this._roomState.expires_at || now + 3600000;
      const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
      this._remainingTime = diff;
      this.events.onCountdown?.(diff);

      if (diff === 0) {
        this.notify?.error("房间到期，连接已断开");
        this.events.onExpired?.();
        this.handleLocalExit();
        return;
      }

      // 剩余时间不足 30 分钟时自动续期
      if (this.autoRenew && diff > 0 && diff <= 1800) {
        if (!this.renewCooldown) {
          void this.renewRoom();
        }
      }
    }, 1000);

    // 每 30s 心跳(ping 不带 user 字段,与旧实现一致)
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WS_OPEN) {
        this.ws.send(JSON.stringify({ action: "ping", userId: this.userId }));
      }
    }, 30000);
  }

  private stopTimers(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.syncTimeTimer) {
      clearInterval(this.syncTimeTimer);
      this.syncTimeTimer = null;
    }
  }

  /** 本地清理:关闭连接、停止定时器(不重置 roomState 快照) */
  private handleLocalExit(): void {
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      // 先摘除全部事件回调再关闭:防止旧连接的异步 onclose/onerror
      // 在新连接建立后串扰(重入 handleLocalExit / 误报错误)
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch (_) {
        /* noop */
      }
    }
    this.stopTimers();
  }
}
