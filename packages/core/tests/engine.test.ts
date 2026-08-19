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
    hasNextSong: false,
    coverTheme: {},
    coverBackground: null,
    spectrumsData: [],
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
    showSpectrums: false,
    simulationPlaying: true,
    showYrc: true,
    lyricsOffset: 0,
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
  it("清理进度与频谱状态", async () => {
    const f = makeFixture();
    f.music.playSongData = song(1);
    await initPlayer(true);
    f.status.spectrumsData = [1, 2, 3];
    soundStop();
    expect(f.status.playSeek).toBe(0);
    expect(f.status.playSeekMs).toBe(0);
    expect(f.status.spectrumsData).toEqual([]);
  });
});
