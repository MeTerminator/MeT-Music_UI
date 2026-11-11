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

  class FakeNativeAudio extends EventTarget {
    currentTime = 0;
    paused = true;
    seeking = false;
    readyState = 4;
    crossOrigin: string | null = null;
  }

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
    _sounds = [{ _node: new FakeNativeAudio() }];
    _webAudio: boolean;

    constructor(
      public opts: {
        volume?: number;
        src?: string[];
        format?: string[];
        rate?: number;
        html5?: boolean;
      },
    ) {
      this._volume = opts.volume ?? 1;
      this._webAudio = !opts.html5;
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

    _emit(ev: string, ...args: unknown[]): void {
      this.emit(ev, ...args);
    }

    play(): number {
      this._playing = true;
      this._sounds[0]._node.paused = false;
      this.emit("play");
      return 1;
    }

    pause(): this {
      this.pauseCalls++;
      this._playing = false;
      this._sounds[0]._node.paused = true;
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
      if (typeof v === "number") {
        this.position = v;
        this._sounds[0]._node.currentTime = v;
      }
      return this._webAudio ? this.position : this._sounds[0]._node.currentTime;
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
import * as extraApi from "../src/api/extra";
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
  refreshPlayProgress,
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

describe("原生音频跳转和缓冲", () => {
  it("Safari 的普通无损 FLAC 也先解码，不把原始 FLAC 交给原生定位", async () => {
    const f = makeFixture();
    f.settings.html5Player = true;
    f.deps.env.preferSoftwareFlac = () => true;
    const decoded = new FakeHowl({});
    const decode = vi.fn(async () => ({ player: decoded, dispose: vi.fn() }));
    f.deps.env.decodeSpatial = decode;
    await createPlayer("https://example.com/song.flac?token=test", false);
    expect(decode).toHaveBeenCalledWith("flac", "https://example.com/song.flac?token=test",
      expect.any(AbortSignal), expect.any(Function), true);
    expect(FakeHowl.instances).toEqual([decoded]);
    decoded.play();
    setSeek(60);
    expect(decoded.seek()).toBe(60);
    decoded.emit("waiting");
    expect(f.status.playState).toBe(true);
    expect(f.status.playBuffering).toBe(true);
    decoded.seek(60.125);
    decoded.emit("playing");
    expect(f.status.playBuffering).toBe(false);
    expect(f.status.playSeekMs).toBe(60125);
  });

  it("FLAC 解码无法读取音源时明确提示原生回退的定位限制", async () => {
    const f = makeFixture();
    f.settings.html5Player = true;
    f.deps.env.preferSoftwareFlac = () => true;
    f.deps.env.decodeSpatial = vi.fn(async () => { throw new Error("CORS"); });
    await createPlayer("https://example.com/song.flac", false);
    expect(FakeHowl.instances[0].opts.src).toEqual(["https://example.com/song.flac"]);
    expect(f.deps.notify.warning).toHaveBeenCalledWith(expect.stringContaining("跳转可能不准确"));
  });

  it("等待缓冲时保留播放意图，恢复时按实际音频位置刷新歌词", async () => {
    const f = makeFixture();
    f.settings.html5Player = true;
    f.music.playSongLyric.lrc = [
      { time: 0, content: "首句" }, { time: 20, content: "第二句" },
      { time: 40, content: "第三句" },
    ];
    await createPlayer("https://example.com/song.mp3", false);
    const howl = FakeHowl.instances[0];
    const audio = howl._sounds[0]._node;
    howl.play();
    setSeek(25);
    audio.seeking = true;
    audio.readyState = 2;
    audio.dispatchEvent(new Event("seeking"));
    audio.dispatchEvent(new Event("waiting"));
    expect(f.status.playBuffering).toBe(true);
    expect(f.status.playState).toBe(true);
    expect(f.status.playSeekMs).toBe(25000);

    // Howler playing() 仍为真，但媒体时钟停住；不能用墙上时间补偿。
    refreshPlayProgress();
    expect(f.status.playSeekMs).toBe(25000);
    audio.seeking = false;
    audio.dispatchEvent(new Event("seeked"));
    expect(f.status.playBuffering).toBe(true);

    audio.currentTime = 25.125;
    audio.readyState = 4;
    audio.dispatchEvent(new Event("playing"));
    expect(f.status.playBuffering).toBe(false);
    expect(f.status.playState).toBe(true);
    expect(f.status.playSeekMs).toBe(25125);
    expect(f.status.playTimeData.currentTime).toBe(25.125);
    expect(f.status.playSongLyricIndex).toBe(1);
  });

  it("暂停时异步完成的跳转仍刷新全部进度，不启动播放", async () => {
    const f = makeFixture();
    f.settings.html5Player = true;
    await createPlayer("https://example.com/song.mp3", false);
    const howl = FakeHowl.instances[0];
    const audio = howl._sounds[0]._node;
    const onSeek = vi.fn();
    f.deps.env.onSeek = onSeek;
    audio.seeking = true;
    audio.dispatchEvent(new Event("seeking"));
    audio.currentTime = 43;
    audio.seeking = false;
    audio.dispatchEvent(new Event("seeked"));
    howl.emit("seek");
    expect(f.status.playBuffering).toBe(false);
    expect(f.status.playState).toBe(false);
    expect(f.status.playSeekMs).toBe(43000);
    expect(f.status.playTimeData.currentTime).toBe(43);
    expect(onSeek).toHaveBeenCalledOnce();
  });

  it("连续跳转时 canplay 不提前恢复，换歌后旧音频事件不再写入状态", async () => {
    const f = makeFixture();
    f.settings.html5Player = true;
    await createPlayer("https://example.com/a.mp3", false);
    const audio = FakeHowl.instances[0]._sounds[0]._node;
    audio.seeking = true;
    audio.dispatchEvent(new Event("seeking"));
    audio.dispatchEvent(new Event("canplay"));
    expect(f.status.playBuffering).toBe(true);
    await createPlayer("https://example.com/b.mp3", false);
    expect(f.status.playBuffering).toBe(false);
    audio.currentTime = 80;
    audio.dispatchEvent(new Event("waiting"));
    audio.dispatchEvent(new Event("timeupdate"));
    expect(f.status.playBuffering).toBe(false);
    expect(f.status.playSeekMs).toBe(0);
  });
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

  it("requests the exact QQ spatial resource and hands it to the matching decoder", async () => {
    const f = makeFixture();
    f.deps.env.supportedSpatialCodecs = () => ["vorbis"];
    const native = vi.spyOn(songApi, "getSongUrl").mockResolvedValue(response("SQ"));
    const url = "https://media.example/spatial.ogg";
    const exact = vi.spyOn(extraApi, "getMusicUrl").mockResolvedValue([{
      track_info: { mid: "1", file_url: url, file_quality: "Q360V3" },
    }]);
    const stream = new FakeHowl({});
    const decode = vi.fn(async () => {
      setTimeout(() => stream.emit("load"), 0);
      return { player: stream, dispose: () => {} };
    });
    f.deps.env.decodeSpatial = decode;

    await initPlayer(false);
    setSeek(22);
    expect(await switchPlaybackQuality("Q360V3")).toBe(true);
    expect(native).toHaveBeenCalledOnce();
    expect(exact).toHaveBeenCalledWith(1, "Q360V3", "qq");
    expect(decode).toHaveBeenCalledWith("vorbis", url, expect.any(AbortSignal), expect.any(Function));
    expect(getSeek()).toBe(22);
    expect(f.status.playbackQuality?.actualLevel).toBe("Q360V3");
  });

  it("falls back when the preferred DTS:X file uses an unsupported presentation", async () => {
    const f = makeFixture();
    f.settings.songLevel = "dtsx";
    f.deps.env.supportedSpatialCodecs = () => ["dtsx"];
    f.deps.env.decodeSpatial = vi.fn().mockRejectedValue(new Error("unsupported layout"));
    const native = vi.spyOn(songApi, "getSongUrl").mockResolvedValue(response("HQ", "audio.mp3"));
    const url = "https://media.example/dtsx.mp4";
    vi.spyOn(extraApi, "getMusicUrl").mockResolvedValue([{
      track_info: { mid: "1", file_url: url, file_quality: "DTSX" },
    }]);

    await initPlayer(true);
    expect(f.deps.env.decodeSpatial).toHaveBeenCalledWith("dtsx", url, expect.any(AbortSignal), expect.any(Function));
    expect(native).toHaveBeenCalledWith(1, "hq", "qq", undefined);
    expect(f.status.playbackQuality).toMatchObject({ requestedLevel: "dtsx", actualLevel: "HQ" });
    expect(FakeHowl.instances.at(-1)?.opts.src).toEqual(["https://media.example/audio.mp3"]);
    expect(f.status.playState).toBe(true);
  });

  it("hands the QQ Atmos E-AC-3 rendition directly to Safari's media player", async () => {
    const f = makeFixture();
    f.settings.html5Player = false;
    f.settings.useMusicCache = true;
    f.deps.env.supportedQQCodecs = () => ["mp3", "eac3"];
    f.deps.env.toBlobUrl = vi.fn(async (url) => url);
    const native = vi.spyOn(songApi, "getSongUrl").mockResolvedValue(response("HQ"));
    const url = "https://media.example/D005.mp4";
    const exact = vi.spyOn(extraApi, "getMusicUrl").mockResolvedValue([{
      track_info: { mid: "1", file_url: url, file_quality: "DAEAC3" },
    }]);
    await initPlayer(false);
    setSeek(34);
    expect(await switchPlaybackQuality("DA")).toBe(true);
    expect(exact).toHaveBeenCalledExactlyOnceWith(1, "DAEAC3", "qq");
    expect(native).toHaveBeenCalledOnce();
    expect(f.deps.env.toBlobUrl).toHaveBeenCalledOnce();
    expect(FakeHowl.instances.at(-1)?.opts).toMatchObject({
      src: [url], html5: true, format: ["dolby"],
    });
    expect(f.status.playbackQuality).toMatchObject({ overrideLevel: "DA", actualLevel: "DAEAC3" });
    expect(getSeek()).toBe(34);
  });

  it("falls back from a saved Dolby preference on browsers without Dolby support", async () => {
    const f = makeFixture();
    f.settings.songLevel = "da";
    const native = vi.spyOn(songApi, "getSongUrl").mockResolvedValue(response("HQ"));
    const exact = vi.spyOn(extraApi, "getMusicUrl");
    await initPlayer(false);
    expect(native).toHaveBeenCalledExactlyOnceWith(1, "hq", "qq", undefined);
    expect(await switchPlaybackQuality("DA")).toBe(false);
    expect(await switchPlaybackQuality("DAEAC3")).toBe(false);
    expect(exact).not.toHaveBeenCalled();
    expect(f.settings.songLevel).toBe("da");
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
