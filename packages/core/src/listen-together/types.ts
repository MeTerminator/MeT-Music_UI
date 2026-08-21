/**
 * 一起听歌(Listen Together)WebSocket 协议类型。
 * 字段与旧 src/stores/listenTogether.js 及后端协议保持一致,迁移期间不做字段更名。
 */
import type { Song } from "../types/song";

/** 房间成员 / 消息中的用户信息 */
export interface RoomUser {
  nickname: string;
  avatar: string;
  qq: string;
  is_anonymous: boolean;
}

/** 房间完整状态(服务端 room_state 消息中的 room 字段) */
export interface RoomState {
  code: string;
  uuid: string;
  playlist: Song[];
  members: RoomUser[];
  current_song_index: number;
  is_playing: boolean;
  seek_position: number;
  play_mode: string;
  delete_after_played: boolean;
  loop_playlist: boolean;
  /** 过期时间戳(ms) */
  expires_at: number;
  logs: unknown[];
  /** 运行期附加:本地收到该状态的时间戳(ms) */
  receivedAt?: number;
  /**
   * 运行期附加:该状态生成时的服务器时间戳(ms)。
   * 取服务端 server_time,缺省为本地时间 + serverTimeOffset。
   */
  serverTime?: number;
}

/** 服务端 room_state 消息 */
export interface RoomStateMessage {
  type: "room_state";
  room: RoomState;
  /** 服务器生成该状态时的时间戳(ms) */
  server_time?: number;
  /** 触发本次状态广播的事件名(如 "seek") */
  event?: string;
}

/** 服务端 error 消息 */
export interface ErrorMessage {
  type: "error";
  message: string;
}

/** 服务端下行消息联合类型 */
export type ServerMessage = RoomStateMessage | ErrorMessage;

/** 客户端可发送的动作名 */
export type ClientAction =
  | "join"
  | "play"
  | "pause"
  | "next"
  | "prev"
  | "seek"
  | "playlist_add"
  | "playlist_remove"
  | "playlist_reorder"
  | "set_play_mode"
  | "update_settings"
  | "play_index"
  | "delete_room"
  | "ping";

/** 客户端上行动作消息 */
export interface ClientActionMessage {
  action: ClientAction;
  userId: string;
  user?: RoomUser;
  data?: Record<string, unknown>;
}

/** 默认房间状态(与旧 store state() 初值一致) */
export const createDefaultRoomState = (): RoomState => ({
  code: "",
  uuid: "",
  playlist: [],
  members: [],
  current_song_index: -1,
  is_playing: false,
  seek_position: 0,
  play_mode: "normal",
  delete_after_played: false,
  loop_playlist: true,
  expires_at: Date.now() + 3600000,
  logs: [],
});
