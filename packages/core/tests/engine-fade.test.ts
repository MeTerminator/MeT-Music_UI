/**
 * fadePlayOrPause 渐出竞态测试(真实播放器分支,howler 以轻量 stub 替身)。
 *
 * 场景:渐出(pause)进行中立刻再次 play——
 *   修复前:渐出的 once("fade") 回调仍挂着,渐出完成后把歌暂停(竞态);
 *   修复后:play 分支摘除该回调、取消渐出并把音量渐回 status.playVolume。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------- howler stub
// vi.mock 工厂在 import 拦截阶段执行,类定义必须经 vi.hoisted 提升

const { FakeHowl } = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;

  class FakeHowl {
    static instances: FakeHowl[] = [];
    handlers = new Map<string, Handler[]>();
    onceHandlers = new Map<string, Handler[]>();
    fadeCalls: Array<[number, number, number]> = [];
    pauseCalls = 0;
    private _playing = false;
    private _volume: number;
    _sounds = [{ _node: {} }];

    constructor(opts: { volume?: number }) {
      this._volume = opts.volume ?? 1;
      FakeHowl.instances.push(this);
    }

    on(ev: string, fn: Handler): this {
      const list = this.handlers.get(ev) ?? [];
      list.push(fn);
      this.handlers.set(ev, list);
      return this;
    }

    once(ev: string, fn: Handler): this {
      const list = this.onceHandlers.get(ev) ?? [];
      list.push(fn);
      this.onceHandlers.set(ev, list);
      return this;
    }

    off(ev: string, fn?: Handler): this {
      if (!fn) {
        this.handlers.delete(ev);
        this.onceHandlers.delete(ev);
        return this;
      }
      this.handlers.set(ev, (this.handlers.get(ev) ?? []).filter((f) => f !== fn));
      this.onceHandlers.set(
        ev,
        (this.onceHandlers.get(ev) ?? []).filter((f) => f !== fn),
      );
      return this;
    }

    emit(ev: string, ...args: unknown[]): void {
      for (const fn of this.handlers.get(ev) ?? []) fn(...args);
      const once = this.onceHandlers.get(ev) ?? [];
      this.onceHandlers.set(ev, []);
      for (const fn of once) fn(...args);
    }

    play(): number {
      this._playing = true;
      this.emit("play");
      return 1;
    }

    pause(): this {
      this.pauseCalls++;
      this._playing = false;
      this.emit("pause");
      return this;
    }

    playing(): boolean {
      return this._playing;
    }

    state(): string {
      return "loaded";
    }

    fade(from: number, to: number, duration: number): this {
      this.fadeCalls.push([from, to, duration]);
      this._volume = to;
      // 渐变完成事件由测试用例手动 emit("fade") 触发
      return this;
    }

    volume(v?: number): number {
      if (typeof v === "number") this._volume = v;
      return this._volume;
    }

    seek(v?: number): number {
      void v;
      return 0;
    }

    duration(): number {
      return 180;
    }

    rate(v?: number): number {
      void v;
      return 1;
    }

    stop(): this {
      this._playing = false;
      return this;
    }

    unload(): void {
      /* noop */
    }
  }

  return { FakeHowl };
});

vi.mock("howler", () => ({
  Howl: FakeHowl,
  Howler: { unload: vi.fn(), ctx: null, masterGain: null },
}));

import { configurePlayer, createPlayer, fadePlayOrPause, soundStop } from "../src/player/engine";
import {
  noopMediaSession,
  type ListenTogetherBridge,
  type MusicState,
  type PlayerDeps,
  type PlayerSettings,
  type SiteState,
  type StatusState,
} from "../src/player/deps";
import { emptyLyric, type Song } from "../src/types/song";

const makeFixture = () => {
  const musicBase = {
    playList: [] as Song[],
    playSongData: { id: 1, name: "s", artists: [{ name: "a" }], duration: "03:00" } as Song,
    playSongLyric: emptyLyric(),
    setPlayHistory: vi.fn(),
    setPersonalFm: vi.fn(async () => {}),
  };
  const music: MusicState = Object.defineProperty(
    musicBase as unknown as MusicState,
    "getPlaySongData",
    {
      get() {
        return musicBase.playSongData;
      },
    },
  );

  const status: StatusState = {
    playState: false,
    playLoading: false,
    playUseOtherSource: false,
    playSeek: 0,
    playSeekMs: 0,
    songCacheProgress: -1,
    hasNextSong: false,
    coverTheme: {},
    coverBackground: null,
    playSongLyricIndex: -1,
    playTimeData: { currentTime: 0, duration: 0, bar: "0", played: "00:00", durationTime: "00:00" },
    playRate: 1,
    playVolume: 0.7,
    playVolumeMute: 0,
    playIndex: 0,
    playMode: "normal",
    playSongMode: "normal",
    playHeartbeatMode: false,
    isInRoom: false,
  };

  const settings: PlayerSettings = {
    songLevel: "hq",
    songVolumeFade: true,
    memorySeek: false,
    useMusicCache: false,
    html5Player: false,
    simulationPlaying: false, // 走真实播放器分支
    showYrc: true,
    lyricsOffset: 0,
    lyricsShiftMs: 0,
    useAMttmlDB: false,
    removeInfo: false,
    removeAMInfo: true,
    themeAutoCover: false,
    themeAutoCoverType: "secondary",
    listenTogetherSyncThreshold: 300,
  };

  const lt: ListenTogetherBridge = {
    roomState: { seek_position: 0, is_playing: false } as ListenTogetherBridge["roomState"],
    serverTimeOffset: 0,
    sendNext: vi.fn(),
    sendChangeIndex: vi.fn(),
    sendPlayOrPause: vi.fn(),
    sendSeek: vi.fn(),
  };
  const site: SiteState = { userData: { userId: null } };

  const deps: PlayerDeps = {
    music: () => music,
    status: () => status,
    settings: () => settings,
    site: () => site,
    lt: () => lt,
    notify: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
    media: noopMediaSession,
    env: {
      setTitle: vi.fn(),
      sessionId: () => "null",
      reload: vi.fn(),
    },
  };
  configurePlayer(deps);
  return { deps, music, status, settings };
};

beforeEach(() => {
  FakeHowl.instances = [];
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  soundStop();
  vi.unstubAllGlobals();
});

describe("fadePlayOrPause 渐出竞态", () => {
  it("渐出进行中再次 play:摘除渐出回调,fade 事件不再触发 pause,音量渐回 playVolume", async () => {
    makeFixture();
    await createPlayer("https://example.com/a.mp3", false);
    const howl = FakeHowl.instances.at(-1)!;

    // 进入播放
    fadePlayOrPause("play");
    expect(howl.playing()).toBe(true);

    // 渐出(pause):注册 once("fade") 完成回调
    fadePlayOrPause("pause");
    expect(howl.onceHandlers.get("fade")?.length ?? 0).toBe(1);
    expect(howl.fadeCalls.at(-1)).toEqual([0.7, 0, 300]);

    // 渐出尚未完成立即 play:应摘除回调并把音量渐回 playVolume
    fadePlayOrPause("play");
    expect(howl.onceHandlers.get("fade")?.length ?? 0).toBe(0);
    expect(howl.fadeCalls.at(-1)?.[1]).toBe(0.7);

    // 即使 fade 事件此刻到达,也不得暂停播放(修复前会 pause)
    const pauseBefore = howl.pauseCalls;
    howl.emit("fade");
    expect(howl.pauseCalls).toBe(pauseBefore);
    expect(howl.playing()).toBe(true);
  });

  it("正常渐出:fade 完成后暂停,标志清理,后续 play 走常规路径", async () => {
    makeFixture();
    await createPlayer("https://example.com/a.mp3", false);
    const howl = FakeHowl.instances.at(-1)!;

    fadePlayOrPause("play");
    fadePlayOrPause("pause");
    howl.emit("fade"); // 渐出完成
    expect(howl.pauseCalls).toBe(1);
    expect(howl.playing()).toBe(false);

    // 标志已清理:再次 play 应走常规 play() 路径而非取消渐出路径
    fadePlayOrPause("play");
    expect(howl.playing()).toBe(true);
  });
});
