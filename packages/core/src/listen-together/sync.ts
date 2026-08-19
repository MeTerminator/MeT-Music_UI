/**
 * 一起听歌播放同步的纯计算函数。
 * 算法照抄旧 src/stores/listenTogether.js 中 syncPlayerState / syncPlayback /
 * checkAndSyncPlayback 的目标进度计算部分;player 操作留在应用层。
 */
import type { RoomState } from "./types";

/**
 * 计算当前时刻房间应处的播放进度(秒)。
 *
 * serverNow = now + serverTimeOffset;
 * serverTimeGen = room.serverTime || serverNow;
 * elapsed = room.is_playing ? (serverNow - serverTimeGen) / 1000 : 0;
 * 返回 (room.seek_position || 0) + elapsed。
 *
 * @param room 房间状态(含运行期附加的 serverTime)
 * @param serverTimeOffset 服务器时间偏移(ms,server - local)
 * @param now 本地当前时间戳(ms,一般为 Date.now())
 */
export function computeTargetSeek(
  room: RoomState,
  serverTimeOffset: number,
  now: number,
): number {
  const serverNow = now + serverTimeOffset;
  const serverTimeGen = room.serverTime || serverNow;
  const elapsed = room.is_playing ? (serverNow - serverTimeGen) / 1000 : 0;
  return (room.seek_position || 0) + elapsed;
}

/**
 * 计算本地进度与目标进度的漂移量(毫秒)。
 * @param localSeek 本地播放进度(秒)
 * @param targetSeek 目标播放进度(秒)
 */
export function computeDriftMs(localSeek: number, targetSeek: number): number {
  return Math.abs(localSeek - targetSeek) * 1000;
}

/**
 * SNTP 时间偏移计算:offset = serverTime - (t0 + t1) / 2。
 * @param t0 请求发出时的本地时间戳(ms)
 * @param t1 响应到达时的本地时间戳(ms)
 * @param serverTime 服务器返回的时间戳(ms)
 */
export function computeServerTimeOffset(
  t0: number,
  t1: number,
  serverTime: number,
): number {
  return serverTime - (t0 + t1) / 2;
}
