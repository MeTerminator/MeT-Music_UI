import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeDriftMs,
  computeServerTimeOffset,
  computeTargetSeek,
} from "../src/listen-together/sync";
import { createDefaultRoomState } from "../src/listen-together/types";
import type { RoomState, RoomUser } from "../src/listen-together/types";
import { ListenTogetherClient } from "../src/listen-together/client";
import type { LTClientEvents, WSLike } from "../src/listen-together/client";

// ---------------------------------------------------------------- sync.ts

describe("computeTargetSeek", () => {
  const baseRoom = (patch: Partial<RoomState>): RoomState => ({
    ...createDefaultRoomState(),
    ...patch,
  });

  it("播放中:seek_position + 距状态生成的经过时间", () => {
    const room = baseRoom({
      is_playing: true,
      seek_position: 10,
      serverTime: 1_000_000,
    });
    // serverNow = 1_000_500 + 500 = 1_001_000 → elapsed = 1s
    expect(computeTargetSeek(room, 500, 1_000_500)).toBeCloseTo(11);
  });

  it("暂停时 elapsed = 0,直接返回 seek_position", () => {
    const room = baseRoom({
      is_playing: false,
      seek_position: 42.5,
      serverTime: 1_000_000,
    });
    expect(computeTargetSeek(room, 500, 2_000_000)).toBe(42.5);
  });

  it("serverTime 缺省时以 serverNow 兜底,elapsed = 0", () => {
    const room = baseRoom({ is_playing: true, seek_position: 30 });
    delete room.serverTime;
    expect(computeTargetSeek(room, 123, 9_999_999)).toBe(30);
  });

  it("seek_position 为 0/假值时按 0 处理", () => {
    const room = baseRoom({
      is_playing: true,
      seek_position: 0,
      serverTime: 1_000_000,
    });
    expect(computeTargetSeek(room, 0, 1_002_000)).toBeCloseTo(2);
  });
});

describe("computeDriftMs", () => {
  it("差值绝对值转毫秒", () => {
    expect(computeDriftMs(10, 10.3)).toBeCloseTo(300);
    expect(computeDriftMs(10.3, 10)).toBeCloseTo(300);
    expect(computeDriftMs(5, 5)).toBe(0);
  });
});

describe("computeServerTimeOffset", () => {
  it("SNTP:serverTime - (t0 + t1) / 2", () => {
    expect(computeServerTimeOffset(100, 300, 1000)).toBe(800);
    expect(computeServerTimeOffset(0, 0, -50)).toBe(-50);
  });
});

// ---------------------------------------------------------------- client.ts

class FakeWebSocket implements WSLike {
  url: string;
  readyState = 0; // CONNECTING
  sent: string[] = [];
  closed: Array<{ code?: number; reason?: string }> = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    this.readyState = 3; // CLOSED
    this.closed.push({ code, reason });
  }
  // 测试辅助
  open(): void {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }
  message(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  parsedSent(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}

const user: RoomUser = {
  nickname: "Ursa",
  avatar: "/images/pic/avatar.jpg",
  qq: "123456",
  is_anonymous: false,
};

describe("ListenTogetherClient", () => {
  let sockets: FakeWebSocket[];
  let client: ListenTogetherClient | null;

  const makeClient = (events: LTClientEvents = {}) => {
    const c = new ListenTogetherClient({
      wsBase: "ws://test.local",
      httpBase: "http://test.local",
      events,
      wsFactory: (url) => {
        const ws = new FakeWebSocket(url);
        sockets.push(ws);
        return ws;
      },
    });
    client = c;
    return c;
  };

  beforeEach(() => {
    sockets = [];
    client = null;
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ server_time: Date.now() }),
      }),
    );
  });

  afterEach(() => {
    client?.destroy();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("connect 后 onopen 发送 join payload(结构与旧 store 一致)", () => {
    const c = makeClient();
    c.connect("ABCD", "session-1", user);

    expect(sockets).toHaveLength(1);
    const ws = sockets[0];
    expect(ws.url).toBe("ws://test.local/api/room/ws/ABCD");
    expect(ws.sent).toHaveLength(0);

    ws.open();
    const [join] = ws.parsedSent();
    expect(join).toEqual({
      action: "join",
      userId: "session-1",
      user: {
        nickname: "Ursa",
        avatar: "/images/pic/avatar.jpg",
        qq: "123456",
        is_anonymous: false,
      },
    });
    expect(c.isConnected).toBe(true);
  });

  it("room_state 回调:第一次 isFirstState=true,之后 false;附加 receivedAt/serverTime", () => {
    const onRoomState = vi.fn();
    const c = makeClient({ onRoomState });
    c.connect("ABCD", "session-1", user);
    const ws = sockets[0];
    ws.open();

    const room = {
      ...createDefaultRoomState(),
      code: "ABCD",
      uuid: "uuid-1",
      is_playing: true,
      seek_position: 12,
    };

    ws.message({ type: "room_state", room, server_time: 111_222, event: "seek" });
    expect(onRoomState).toHaveBeenCalledTimes(1);
    let [gotRoom, gotEvent, isFirst] = onRoomState.mock.calls[0];
    expect(isFirst).toBe(true);
    expect(gotEvent).toBe("seek");
    expect(gotRoom.uuid).toBe("uuid-1");
    expect(gotRoom.serverTime).toBe(111_222);
    expect(typeof gotRoom.receivedAt).toBe("number");
    expect(c.roomState.uuid).toBe("uuid-1");

    // 第二条:无 server_time,serverTime 回退为本地时间 + offset
    ws.message({ type: "room_state", room: { ...room, seek_position: 20 } });
    expect(onRoomState).toHaveBeenCalledTimes(2);
    [gotRoom, gotEvent, isFirst] = onRoomState.mock.calls[1];
    expect(isFirst).toBe(false);
    expect(gotEvent).toBeUndefined();
    expect(gotRoom.serverTime).toBe(Date.now() + c.serverTimeOffset);
    expect(c.roomState.seek_position).toBe(20);
  });

  it("error 消息触发 onError 回调", () => {
    const onError = vi.fn();
    const c = makeClient({ onError });
    c.connect("ABCD", "session-1", user);
    sockets[0].open();

    sockets[0].message({ type: "error", message: "房间不存在" });
    expect(onError).toHaveBeenCalledWith("房间不存在");
  });

  it("sendSeek 消息结构与旧 store 一致", () => {
    const c = makeClient();
    c.connect("ABCD", "session-1", user);
    const ws = sockets[0];
    ws.open();
    ws.sent.length = 0;

    c.sendSeek(42.5);
    expect(ws.parsedSent()).toEqual([
      {
        action: "seek",
        userId: "session-1",
        user,
        data: { currentTime: 42.5 },
      },
    ]);
  });

  it("sendPlayOrPause:播放中发 pause,否则发 play", () => {
    const c = makeClient();
    c.connect("ABCD", "session-1", user);
    const ws = sockets[0];
    ws.open();
    ws.sent.length = 0;

    c.sendPlayOrPause(true);
    c.sendPlayOrPause(false);
    const actions = ws.parsedSent().map((m) => m.action);
    expect(actions).toEqual(["pause", "play"]);
  });

  it("非 OPEN 状态不发送", () => {
    const c = makeClient();
    c.connect("ABCD", "session-1", user);
    const ws = sockets[0];
    // 未 open,readyState = 0
    c.sendSeek(10);
    c.sendNext();
    c.deleteRoom();
    expect(ws.sent).toHaveLength(0);
    expect(c.isConnected).toBe(false);
  });

  it("心跳:每 30s 发送 ping(不带 user 字段)", async () => {
    const c = makeClient();
    c.connect("ABCD", "session-1", user);
    const ws = sockets[0];
    ws.open();
    ws.sent.length = 0;

    await vi.advanceTimersByTimeAsync(30_000);
    const pings = ws.parsedSent().filter((m) => m.action === "ping");
    expect(pings).toHaveLength(1);
    expect(pings[0]).toEqual({ action: "ping", userId: "session-1" });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(ws.parsedSent().filter((m) => m.action === "ping")).toHaveLength(2);
  });

  it("onclose 触发 onClosed 回调并清理", () => {
    const onClosed = vi.fn();
    const c = makeClient({ onClosed });
    c.connect("ABCD", "session-1", user);
    const ws = sockets[0];
    ws.open();

    ws.onclose?.({ code: 4004, reason: "" });
    expect(onClosed).toHaveBeenCalledWith(4004, "");
    expect(c.isConnected).toBe(false);
  });
});
