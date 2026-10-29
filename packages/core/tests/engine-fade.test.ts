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
    static autoLoad = false;
    static failNextLoad = false;
    private position = 0;
    handlers = new Map<string, Handler[]>();
    onceHandlers = new Map<string, Handler[]>();
    fadeCalls: Array<[number, number, number]> = [];
    pauseCalls = 0;
    private _playing = false;
    private _volume: number;
    _sounds = [{ _node: {} }];

    constructor(
      public opts: {
        volume?: number;
        src?: string[];
        format?: string[];
        rate?: number;
      },
    ) {
      this._volume = opts.volume ?? 1;
      FakeHowl.instances.push(this);
      if (FakeHowl.autoLoad) {
        const fail = FakeHowl.failNextLoad;
        FakeHowl.failNextLoad = false;
        queueMicrotask(() =>
          this.emit(fail ? "loaderror" : "load", ...(fail ? [1, 4] : [])),
        );
      }
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
      this.handlers.set(
        ev,
        (this.handlers.get(ev) ?? []).filter((f) => f !== fn),
      );
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
      if (typeof v === "number") this.position = v;
      return this.position;
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

import * as songApi from "../src/api/song";
import {
  configurePlayer,
  createPlayer,
  fadePlayOrPause,
  soundStop,
  initPlayer,
  switchPlaybackQuality,
  changePlayIndex,
  setSeek,
  getSeek,
} from "../src/player/engine";
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
    playSongData: {
      id: 1,
      name: "s",
      artists: [{ name: "a" }],
      duration: "03:00",
    } as Song,
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
    playTimeData: {
      currentTime: 0,
      duration: 0,
      bar: "0",
      played: "00:00",
      durationTime: "00:00",
    },
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
    roomState: {
      seek_position: 0,
      is_playing: false,
    } as ListenTogetherBridge["roomState"],
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
    notify: {
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    },
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
  FakeHowl.autoLoad = false;
  FakeHowl.failNextLoad = false;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  soundStop();
  vi.restoreAllMocks();
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

describe("NAC 在线播放", () => {
  it("流式播放器沿用加载、音量和进度控制，后台解码不占用进度条", async () => {
    const f = makeFixture();
    f.settings.songLevel = "nac";
    f.status.playLoading = true;
    const stream = new FakeHowl({});
    const dispose = vi.fn();
    let progress!: (percent: number) => void;
    f.deps.env.decodeNac = vi.fn(async (_url, _signal, onProgress) => {
      progress = onProgress;
      return { player: stream, dispose };
    });
    await createPlayer("https://example.com/song.nac", false);
    expect(FakeHowl.instances).toHaveLength(1);
    expect(stream.volume()).toBe(f.status.playVolume);
    stream.emit("load");
    expect(f.status.playLoading).toBe(false);
    progress(75);
    expect(f.status.songCacheProgress).toBe(-1);
    soundStop();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("关闭自动缓存仍解码 NAC，并以 WAV 交付 Howler，停止时释放", async () => {
    const f = makeFixture();
    f.settings.songLevel = "nac";
    const dispose = vi.fn();
    f.deps.env.decodeNac = vi.fn(async (_url, _signal, progress) => {
      progress(50);
      return { url: "blob:nac-wav", format: "wav", dispose };
    });
    f.deps.env.toBlobUrl = vi.fn();
    await createPlayer("https://example.com/song", false);
    expect(f.deps.env.decodeNac).toHaveBeenCalledOnce();
    expect(f.deps.env.toBlobUrl).not.toHaveBeenCalled();
    expect(FakeHowl.instances.at(-1)?.opts).toMatchObject({
      src: ["blob:nac-wav"],
      format: ["wav"],
    });
    expect(f.status.songCacheProgress).toBe(-1);
    soundStop();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("停止期间取消解码，迟到的结果释放且不能创建播放器", async () => {
    const f = makeFixture();
    f.settings.songLevel = "nac";
    const dispose = vi.fn();
    let signal!: AbortSignal;
    let complete!: (value: {
      url: string;
      format: string;
      dispose(): void;
    }) => void;
    f.deps.env.decodeNac = vi.fn((_url, inputSignal) => {
      signal = inputSignal;
      return new Promise<{ url: string; format: string; dispose(): void }>(
        (resolve) => {
          complete = resolve;
        },
      );
    });
    const loading = createPlayer("https://example.com/song.nac", false);
    soundStop();
    expect(signal.aborted).toBe(true);
    complete({ url: "blob:obsolete", format: "wav", dispose });
    await loading;
    expect(dispose).toHaveBeenCalledOnce();
    expect(FakeHowl.instances).toHaveLength(0);
  });

  it("解码失败不将 NAC 直链交给浏览器，并清除加载状态", async () => {
    const f = makeFixture();
    f.settings.songLevel = "nac";
    f.status.playLoading = true;
    f.deps.env.decodeNac = vi.fn(async () => {
      throw new Error("CRC mismatch");
    });
    await expect(
      createPlayer("https://example.com/song.nac", false),
    ).rejects.toThrow("CRC mismatch");
    expect(FakeHowl.instances).toHaveLength(0);
    expect(f.status.playLoading).toBe(false);
    expect(f.status.songCacheProgress).toBe(-1);
  });

  it("QQ 的 NAC 设置不影响网易云普通音频", async () => {
    const f = makeFixture();
    f.settings.songLevel = "nac";
    f.music.playSongData.source = "netease";
    f.deps.env.decodeNac = vi.fn();
    await createPlayer("https://example.com/song.mp3", false);
    expect(f.deps.env.decodeNac).not.toHaveBeenCalled();
    expect(FakeHowl.instances.at(-1)?.opts.src).toEqual([
      "https://example.com/song.mp3",
    ]);
  });
});

describe("current-play quality override", () => {
  const response = (level: string, name = "audio.flac") => ({
    code: 200 as const,
    data: [
      {
        id: "1",
        url: `https://media.example/${name}`,
        size: 100,
        track_info: {
          mid: "1",
          available_qualities: ["HQ", "SQ", "RS", "NAC"],
        },
        time: 180000,
        level,
        code: 200 as const,
      },
    ],
  });
  beforeEach(() => {
    FakeHowl.autoLoad = true;
    vi.spyOn(songApi, "getSongLyric").mockRejectedValue(
      new Error("offline lyrics"),
    );
    vi.spyOn(songApi, "getAMttmlLyric").mockResolvedValue({
      status: "no_lyrics",
    });
  });

  it("shows the actual fallback and preserves paused seek, volume, rate and global preference", async () => {
    const f = makeFixture();
    f.settings.songLevel = "rs";
    f.settings.memorySeek = false;
    f.status.playRate = 1.25;
    const request = vi
      .spyOn(songApi, "getSongUrl")
      .mockResolvedValueOnce(response("SQ"))
      .mockResolvedValueOnce(response("HQ", "audio.mp3"));
    await initPlayer(false);
    expect(f.status.playbackQuality?.actualLevel).toBe("SQ");
    setSeek(37.25);
    expect(await switchPlaybackQuality("HQ")).toBe(true);
    expect(getSeek()).toBe(37.25);
    expect(f.status.playState).toBe(false);
    expect(f.status.playbackQuality).toMatchObject({
      actualLevel: "HQ",
      overrideLevel: "HQ",
      switching: false,
    });
    expect(f.settings.songLevel).toBe("rs");
    expect(FakeHowl.instances.at(-1)?.opts.rate).toBe(1.25);
    expect(FakeHowl.instances.at(-1)?.volume()).toBe(f.status.playVolume);
    expect(request.mock.calls[1][1]).toBe("HQ");
  });

  it("keeps a playing song running at its seek after the quality reload", async () => {
    const f = makeFixture();
    vi.spyOn(songApi, "getSongUrl")
      .mockResolvedValueOnce(response("SQ"))
      .mockResolvedValueOnce(response("HQ", "audio.mp3"));
    await initPlayer(true);
    setSeek(48);
    expect(await switchPlaybackQuality("HQ")).toBe(true);
    expect(FakeHowl.instances.at(-1)?.playing()).toBe(true);
    expect(getSeek()).toBe(48);
    expect(f.status.playState).toBe(true);
  });

  it("keeps the existing player if link resolution fails", async () => {
    const f = makeFixture();
    vi.spyOn(songApi, "getSongUrl")
      .mockResolvedValueOnce(response("SQ"))
      .mockRejectedValueOnce(new Error("no link"));
    await initPlayer(false);
    setSeek(22);
    const old = FakeHowl.instances.at(-1);
    expect(await switchPlaybackQuality("HQ")).toBe(false);
    expect(FakeHowl.instances.at(-1)).toBe(old);
    expect(getSeek()).toBe(22);
    expect(f.status.playbackQuality?.actualLevel).toBe("SQ");
    expect(f.status.playbackQuality?.overrideLevel).toBe(null);
  });

  it("restores the old source on media load failure without skipping the song", async () => {
    const f = makeFixture();
    vi.spyOn(songApi, "getSongUrl")
      .mockResolvedValueOnce(response("SQ", "old.flac"))
      .mockResolvedValueOnce(response("HQ", "broken.mp3"));
    await initPlayer(false);
    setSeek(19);
    FakeHowl.failNextLoad = true;
    expect(await switchPlaybackQuality("HQ")).toBe(false);
    expect(FakeHowl.instances.at(-1)?.opts.src).toEqual([
      "https://media.example/old.flac",
    ]);
    expect(getSeek()).toBe(19);
    expect(f.music.playSongData.id).toBe(1);
    expect(f.status.playbackQuality?.actualLevel).toBe("SQ");
  });

  it("clears the override on the next initialization, even for the same song", async () => {
    const f = makeFixture();
    f.settings.songLevel = "rs";
    const request = vi
      .spyOn(songApi, "getSongUrl")
      .mockResolvedValue(response("SQ"));
    await initPlayer(false);
    await switchPlaybackQuality("HQ");
    expect(f.status.playbackQuality?.overrideLevel).toBe("HQ");
    await initPlayer(false);
    expect(f.status.playbackQuality?.overrideLevel).toBe(null);
    expect(request.mock.calls.at(-1)?.[1]).toBe("rs");
  });

  it("does not apply a delayed quality response after a song change", async () => {
    const f = makeFixture();
    let finish!: (value: ReturnType<typeof response>) => void;
    vi.spyOn(songApi, "getSongUrl")
      .mockResolvedValueOnce(response("SQ"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(response("RS"));
    await initPlayer(false);
    const changing = switchPlaybackQuality("HQ");
    f.music.playSongData = { ...f.music.playSongData, id: 2 };
    await initPlayer(false);
    finish(response("HQ"));
    expect(await changing).toBe(false);
    expect(f.status.playbackQuality?.actualLevel).toBe("RS");
    expect(f.status.playbackQuality?.overrideLevel).toBe(null);
  });
});

describe("quality reset on single-song repeat", () => {
  it("uses the global preference when the current play ends and repeats", async () => {
    const f = makeFixture();
    FakeHowl.autoLoad = true;
    f.settings.songLevel = "rs";
    const request = vi.spyOn(songApi, "getSongUrl").mockResolvedValue({
      code: 200,
      data: [
        {
          id: "1",
          url: "https://media.example/audio.flac",
          track_info: { mid: "1" },
          time: 180000,
          level: "SQ",
          code: 200,
        },
      ],
    });
    vi.spyOn(songApi, "getSongLyric").mockRejectedValue(
      new Error("offline lyrics"),
    );
    vi.spyOn(songApi, "getAMttmlLyric").mockResolvedValue({
      status: "no_lyrics",
    });
    await initPlayer(false);
    await switchPlaybackQuality("HQ");
    expect(f.status.playbackQuality?.overrideLevel).toBe("HQ");
    f.status.playSongMode = "repeat";
    await changePlayIndex("next", false);
    expect(f.status.playbackQuality?.overrideLevel).toBe(null);
    expect(request.mock.calls.at(-1)?.[1]).toBe("rs");
    expect(f.music.playSongData.id).toBe(1);
  });
});
