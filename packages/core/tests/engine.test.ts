import * as songApi from "../src/api/song";
import { setApiBaseURL } from "../src/api/client";
/**
 * 播放引擎测试。走模拟播放(simulationPlaying)路径,不触真实音频;
 * 重点验证队列行为(changePlayIndex/addSongToNext)与状态写入,
 * 这些是重写期间最容易破坏的纯逻辑。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSongToNext,
  changePlayIndex,
  configurePlayer,
  refreshLyricProfanity,
  fadePlayOrPause,
  getSeek,
  initPlayer,
  playAllSongs,
  setSeek,
  soundStop,
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

const song = (id: number, name = `song-${id}`): Song => ({
  id,
  name,
  artists: [{ name: "artist" }],
  duration: "03:00",
});

interface Fixture {
  deps: PlayerDeps;
  music: MusicState;
  status: StatusState;
  settings: PlayerSettings;
  lt: ListenTogetherBridge & { calls: string[] };
  ticks: { count: number };
}

const makeFixture = (overrides?: { settings?: Partial<PlayerSettings> }): Fixture => {
  const musicBase = {
    playList: [] as Song[],
    playSongData: {} as Song,
    playSongLyric: emptyLyric(),
    setPlayHistory: vi.fn(),
    setPersonalFm: vi.fn(async () => {}),
  };
  const music: MusicState = Object.defineProperty(musicBase as unknown as MusicState, "getPlaySongData", {
    get() {
      return musicBase.playSongData;
    },
  });

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
    songVolumeFade: false,
    memorySeek: false,
    useMusicCache: false,
    html5Player: false,
    simulationPlaying: true,
    showYrc: true,
    lyricsOffset: 0,
    lyricsShiftMs: 0,
    useAMttmlDB: false,
    removeInfo: false,
    removeAMInfo: true,
    themeAutoCover: false,
    themeAutoCoverType: "secondary",
    listenTogetherSyncThreshold: 300,
    ...overrides?.settings,
  };

  const lt = {
    calls: [] as string[],
    roomState: { seek_position: 0, is_playing: false } as ListenTogetherBridge["roomState"],
    serverTimeOffset: 0,
    sendNext() {
      this.calls.push("next");
    },
    sendChangeIndex(type: "next" | "prev") {
      this.calls.push(`change:${type}`);
    },
    sendPlayOrPause() {
      this.calls.push("playOrPause");
    },
    sendSeek(s: number) {
      this.calls.push(`seek:${s}`);
    },
  };

  const site: SiteState = { userData: { userId: null } };
  const ticks = { count: 0 };

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
      // "null" 会让 reportPlaybackStatus 直接短路,测试无需网络
      sessionId: () => "null",
      reload: vi.fn(),
      onTick: () => {
        ticks.count++;
      },
    },
  };
  configurePlayer(deps);
  return { deps, music, status, settings, lt, ticks };
};

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  soundStop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("模拟播放", () => {
  it("initPlayer(true) 进入播放状态并初始化时长", async () => {
    const f = makeFixture();
    f.music.playList = [song(1)];
    f.music.playSongData = song(1);
    await initPlayer(true);
    expect(f.status.playState).toBe(true);
    expect(f.status.playTimeData.duration).toBe(180);
    expect(f.status.playLoading).toBe(false);
  });

  it("initPlayer(false) 保持暂停", async () => {
    const f = makeFixture();
    f.music.playSongData = song(1);
    await initPlayer(false);
    expect(f.status.playState).toBe(false);
  });

  it("setSeek 后 getSeek 返回目标进度", async () => {
    const f = makeFixture();
    f.music.playSongData = song(1);
    await initPlayer(true);
    setSeek(30, true);
    expect(Math.abs(getSeek() - 30)).toBeLessThan(0.5);
    expect(f.status.playSeek).toBeGreaterThanOrEqual(30);
  });

  it("暂停态无歌词区间和重复跳转在状态更新后均通知 UI", async () => {
    const f = makeFixture();
    f.music.playSongData = song(1);
    await initPlayer(false);
    f.music.playSongLyric = {
      ...emptyLyric(),
      lrc: [{ time: 20, content: "首句" }, { time: 100, content: "末句" }],
    };
    const positions: Array<[number, number]> = [];
    f.deps.env.onSeek = () => {
      positions.push([f.status.playSeekMs, f.status.playSongLyricIndex]);
    };
    for (const time of [5, 60, 70, 150, 5, 5]) setSeek(time, true);
    expect(positions).toEqual([
      [5000, -1], [60000, 0], [70000, 0], [150000, 1], [5000, -1], [5000, -1],
    ]);
    expect(f.status.playState).toBe(false);
  });
});

describe("changePlayIndex 队列行为", () => {
  it("normal 模式 next 前进、prev 后退并回绕", async () => {
    const f = makeFixture();
    f.music.playList = [song(1), song(2), song(3)];
    f.music.playSongData = song(1);
    f.status.playIndex = 0;
    await changePlayIndex("next");
    expect(f.status.playIndex).toBe(1);
    expect(f.music.playSongData.id).toBe(2);

    f.status.playIndex = 2;
    await changePlayIndex("next");
    expect(f.status.playIndex).toBe(0); // 越界回绕到头

    f.status.playIndex = 0;
    await changePlayIndex("prev");
    expect(f.status.playIndex).toBe(2); // 负数回绕到尾
  });

  it("hasNextSong 优先消费且只生效一次", async () => {
    const f = makeFixture();
    f.music.playList = [song(1), song(2), song(3)];
    f.music.playSongData = song(1);
    f.status.playSongMode = "random";
    f.status.hasNextSong = true;
    f.status.playIndex = 0;
    await changePlayIndex("next");
    // hasNextSong 时无视 random,顺序 +1
    expect(f.status.playIndex).toBe(1);
    expect(f.status.hasNextSong).toBe(false);
  });

  it("random 模式索引落在列表范围内", async () => {
    const f = makeFixture();
    f.music.playList = [song(1), song(2), song(3), song(4)];
    f.music.playSongData = song(1);
    f.status.playSongMode = "random";
    await changePlayIndex("next");
    expect(f.status.playIndex).toBeGreaterThanOrEqual(0);
    expect(f.status.playIndex).toBeLessThan(4);
  });

  it("一起听房间内转发给房间而不本地切歌", async () => {
    const f = makeFixture();
    f.music.playList = [song(1), song(2)];
    f.status.isInRoom = true;
    f.status.playIndex = 0;
    await changePlayIndex("next");
    expect(f.lt.calls).toContain("change:next");
    expect(f.status.playIndex).toBe(0); // 本地不动
  });
});

describe("addSongToNext", () => {
  it("新歌插入当前歌曲之后", () => {
    const f = makeFixture();
    f.music.playList = [song(1), song(2), song(3)];
    f.music.playSongData = song(1);
    f.status.playIndex = 0;
    addSongToNext(song(9));
    expect(f.music.playList.map((s) => s.id)).toEqual([1, 9, 2, 3]);
    expect(f.status.hasNextSong).toBe(true);
  });

  it("已存在的歌曲被移动到下一首位置", () => {
    const f = makeFixture();
    f.music.playList = [song(1), song(2), song(3)];
    f.music.playSongData = song(1);
    f.status.playIndex = 0;
    addSongToNext(song(3));
    expect(f.music.playList.map((s) => s.id)).toEqual([1, 3, 2]);
  });
});

describe("playAllSongs", () => {
  it("不在歌单内时从头播放", async () => {
    const f = makeFixture();
    const list = [song(10), song(11)];
    f.music.playSongData = {} as Song;
    await playAllSongs(list);
    expect(f.status.playIndex).toBe(0);
    expect(f.music.playSongData.id).toBe(10);
    expect(f.music.playList).toHaveLength(2);
    expect(f.status.playMode).toBe("normal");
  });

  it("一起听房间内拒绝", async () => {
    const f = makeFixture();
    f.status.isInRoom = true;
    const result = await playAllSongs([song(1)]);
    expect(result).toBe(false);
  });
});

describe("soundStop", () => {
  it("清理进度与缓存下载进度", async () => {
    const f = makeFixture();
    f.music.playSongData = song(1);
    await initPlayer(true);
    f.status.songCacheProgress = 42;
    soundStop();
    expect(f.status.playSeek).toBe(0);
    expect(f.status.playSeekMs).toBe(0);
    expect(f.status.songCacheProgress).toBe(-1);
  });
});


describe("provider identity", () => {
  it("does not collapse songs with equal IDs on different providers", () => {
    const f = makeFixture();
    f.music.playList = [song(1), song(2)];
    f.music.playSongData = song(1);
    f.status.playIndex = 0;
    addSongToNext({ ...song(2), source: "netease" });
    expect(f.music.playList).toHaveLength(3);
    expect(f.music.playList[1].source).toBe("netease");
  });
  it.each(["netease", "qq"] as const)("uses the %s platform's independent playback quality", async (platform) => {
    const f = makeFixture({ settings: { simulationPlaying: false, songLevel: "sq", neteaseSongLevel: "jymaster" } });
    f.music.playSongData = { ...song(1), source: platform === "netease" ? "netease" : "qqmusic" };
    f.music.playList = [f.music.playSongData];
    setApiBaseURL("http://localhost/api/web");
    const fetchSpy = vi.fn(async (_input: Request) => new Response(JSON.stringify({ code: 200, data: [{ id: 1, url: null, size: 0, track_info: { id: 1, mid: "1", source: "netease" }, time: 0, level: "standard", code: 200 }] }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchSpy);
    await initPlayer(true);
    expect(fetchSpy).toHaveBeenCalled();
    const request = fetchSpy.mock.calls[0]?.[0] as unknown as Request;
    expect(new URL(request.url).searchParams.get("platform")).toBe(platform);
    expect(new URL(request.url).searchParams.get("level")).toBe(platform === "netease" ? "jymaster" : "sq");
  });
});


describe("playback feedback", () => {
  const mockResponse = async (input: string | Request) => new Response(JSON.stringify(
    input instanceof Request
      ? { code: 200, source: "network", lrc: "", lrctrans: "", qrc: "", qrctrans: "", qrcroma: "" }
      : { status: "ok" },
  ));
  it.each(["netease", "qqmusic", undefined] as const)("reports play, progress and pause for source %s", async (source) => {
    vi.useFakeTimers();
    const f = makeFixture();
    const sessionId = "12345678-1234-1234-1234-123456789012";
    f.deps.env.sessionId = () => sessionId;
    f.music.playSongData = { ...song(123), source };
    const fetchSpy = vi.fn(mockResponse);
    vi.stubGlobal("fetch", fetchSpy);

    await initPlayer(true);
    await vi.advanceTimersByTimeAsync(5000);
    fadePlayOrPause("pause");
    await Promise.resolve();

    const calls = vi.mocked(fetch).mock.calls.filter(([url]) => typeof url === "string");
    const reports = calls.map(([url, init]) => {
      expect(url).toBe("/api/web/collect/feedback/webplayer");
      expect(init?.method).toBe("POST");
      return JSON.parse(String(init?.body)).data;
    });
    expect(reports.map(data => data.event)).toEqual(["play", "progress", "pause"]);
    expect(reports.map(data => data.status)).toEqual([true, true, false]);
    for (const data of reports) {
      expect(data.songSource).toBe(source ?? "qqmusic");
      expect(data.songMid).toBe("123");
      expect(data.sessionId).toBe(sessionId);
      expect(Number.isFinite(data.currentTime)).toBe(true);
      expect(Number.isFinite(data.systemTime)).toBe(true);
    }
  });

  it.each([{ source: "local" as const }, { path: "/music/local.mp3" }])("skips local songs %j", async (identity) => {
    const f = makeFixture();
    f.deps.env.sessionId = () => "12345678-1234-1234-1234-123456789012";
    f.music.playSongData = { ...song(123), ...identity };
    const fetchSpy = vi.fn(mockResponse);
    vi.stubGlobal("fetch", fetchSpy);
    await initPlayer(true);
    fadePlayOrPause("pause");
    await Promise.resolve();
    expect(fetchSpy.mock.calls.filter(([url]) => typeof url === "string")).toHaveLength(0);
  });
});


describe("切歌歌词隔离", () => {
  const response = (text: string) => ({ code: 200, source: "network", lrc: `[00:01.000]${text}`,
    lrctrans: "", qrc: "", qrctrans: "", qrcroma: "" }) as Awaited<ReturnType<typeof songApi.getSongLyric>>;
  const pending = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };

  it("切歌立即清空，当前请求失败后仍无旧歌词", async () => {
    const f = makeFixture();
    const request = pending<Awaited<ReturnType<typeof songApi.getSongLyric>>>();
    vi.spyOn(songApi, "getSongLyric").mockReturnValue(request.promise);
    f.music.playSongData = song(1);
    f.music.playSongLyric = { ...emptyLyric(), lrc: [{ time: 1, content: "旧歌词" }] };
    await initPlayer(false);
    expect(f.music.playSongLyric).toEqual(emptyLyric());
    expect(f.status.playSongLyricIndex).toBe(-1);
    expect(f.music.playSongLyricStatus).toBe("loading");
    request.reject(new Error("network failed"));
    await vi.waitFor(() => expect(f.deps.notify.error).toHaveBeenCalledWith("歌词处理出错"));
    expect(f.music.playSongLyric).toEqual(emptyLyric());
    expect(f.music.playSongLyricStatus).toBe("error");
  });

  it.each([false, true])("旧请求晚返回或失败不能影响新歌（失败=%s）", async (fail) => {
    const f = makeFixture();
    const old = pending<Awaited<ReturnType<typeof songApi.getSongLyric>>>();
    vi.spyOn(songApi, "getSongLyric").mockReturnValueOnce(old.promise).mockResolvedValueOnce(response("新歌歌词"));
    f.music.playSongData = song(1);
    await initPlayer(false);
    f.music.playSongData = song(2);
    await initPlayer(false);
    await vi.waitFor(() => expect(f.music.playSongLyric.lrc[0]?.content).toBe("新歌歌词"));
    if (fail) old.reject(new Error("stale failure"));
    else old.resolve(response("旧歌歌词"));
    await old.promise.catch(() => undefined);
    expect(f.music.playSongLyric.lrc[0]?.content).toBe("新歌歌词");
    expect(f.deps.notify.error).not.toHaveBeenCalled();
    expect(f.music.playSongLyricStatus).toBe("ready");
  });

  it("A→B→A 时第一次 A 的结果也已过期", async () => {
    const f = makeFixture();
    const old = pending<Awaited<ReturnType<typeof songApi.getSongLyric>>>();
    vi.spyOn(songApi, "getSongLyric").mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(response("B")).mockResolvedValueOnce(response("新的 A"));
    for (const id of [1, 2, 1]) {
      f.music.playSongData = song(id);
      await initPlayer(false);
    }
    await vi.waitFor(() => expect(f.music.playSongLyric.lrc[0]?.content).toBe("新的 A"));
    old.resolve(response("过期的 A"));
    await old.promise;
    expect(f.music.playSongLyric.lrc[0]?.content).toBe("新的 A");
  });

  it("旧曲等待 TTML 期间切歌，不能回写旧曲的解析结果", async () => {
    const f = makeFixture({ settings: { useAMttmlDB: true } });
    const ttml = pending<Awaited<ReturnType<typeof songApi.getAMttmlLyric>>>();
    vi.spyOn(songApi, "getSongLyric").mockResolvedValueOnce(response("旧曲")).mockResolvedValueOnce(response("当前曲"));
    const ttmlSpy = vi.spyOn(songApi, "getAMttmlLyric").mockReturnValueOnce(ttml.promise).mockResolvedValueOnce({ status: "no_lyrics" });
    f.music.playSongData = song(1);
    await initPlayer(false);
    await vi.waitFor(() => expect(ttmlSpy).toHaveBeenCalledTimes(1));
    f.music.playSongData = song(2);
    await initPlayer(false);
    await vi.waitFor(() => expect(f.music.playSongLyric.lrc[0]?.content).toBe("当前曲"));
    ttml.resolve({ status: "no_lyrics" });
    await ttml.promise;
    expect(f.music.playSongLyric.lrc[0]?.content).toBe("当前曲");
  });
});


describe("歌词脏字补全设置", () => {
  it.each([false, true])("歌词异步返回时使用最新开关（enabled=%s）", async (enabled) => {
    const f = makeFixture({ settings: { uncensorMaskedProfanity: !enabled } });
    let resolve!: (value: Awaited<ReturnType<typeof songApi.getSongLyric>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof songApi.getSongLyric>>>((done) => { resolve = done; });
    vi.spyOn(songApi, "getSongLyric").mockReturnValue(pending);
    f.music.playSongData = song(1);
    await initPlayer(false);
    f.settings.uncensorMaskedProfanity = enabled;
    refreshLyricProfanity();
    resolve({ code: 200, source: "network", lrc: "[00:01.000]sh*t", lrctrans: "", qrc: "", qrctrans: "", qrcroma: "" } as Awaited<ReturnType<typeof songApi.getSongLyric>>);
    await vi.waitFor(() => expect(f.music.playSongLyricStatus).toBe("ready"));
    expect(f.music.playSongLyric.lrc[0].content).toBe(enabled ? "shit" : "sh*t");
  });

  it("默认不补全，暂停时切换立即生效且不请求歌词；换歌不沿用旧原文", () => {
    const f = makeFixture();
    const fetch = vi.spyOn(songApi, "getSongLyric");
    const source = { ...emptyLyric(), lrc: [{ time: 0, content: "sh*t d**n" }] };
    f.music.playSongLyric = source;
    refreshLyricProfanity();
    expect(f.music.playSongLyric).toBe(source);
    f.settings.uncensorMaskedProfanity = true;
    refreshLyricProfanity();
    expect(f.music.playSongLyric.lrc[0].content).toBe("shit damn");
    f.settings.uncensorMaskedProfanity = false;
    refreshLyricProfanity();
    expect(f.music.playSongLyric).toBe(source);
    f.music.playSongLyric = { ...emptyLyric(), lrc: [{ time: 0, content: "b*tches" }] };
    f.settings.uncensorMaskedProfanity = true;
    refreshLyricProfanity();
    expect(f.music.playSongLyric.lrc[0].content).toBe("bitches");
    f.settings.uncensorMaskedProfanity = false;
    refreshLyricProfanity();
    expect(f.music.playSongLyric.lrc[0].content).toBe("b*tches");
    expect(fetch).not.toHaveBeenCalled();
  });
});
