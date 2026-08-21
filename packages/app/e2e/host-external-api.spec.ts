import { expect, test, type Page } from "@playwright/test";
import { seedPlayback, type DebugWindow } from "./seed";

/**
 * 外部 API 支撑的宿主全局(契约 v2 增量,见 src/host/contract.ts 末尾)。
 *
 * 桌面端的 HTTP / WebSocket 外部接口靠这几个函数取数与控制播放,
 * 数据全部现取 store —— 暂停后 hook tick 就停了,拿 hook 缓存会读到陈旧进度,
 * 所以这里的断言重点是「暂停状态下仍然准确」与「play/pause 幂等」。
 */

interface ApiWindow extends DebugWindow {
  $MeTMusic_play?: () => void;
  $MeTMusic_pause?: () => void;
  $MeTMusic_seek?: (seconds: number) => void;
  $MeTMusic_setVolume?: (volume: number) => void;
  $MeTMusic_getState?: () => {
    state: string;
    position: number;
    duration: number;
    volume: number;
    isFinished: boolean;
  };
  $MeTMusic_getNowPlaying?: () => {
    name: string;
    artist: string;
    lyricAvailable: boolean;
    lyricLineCount: number;
    state: string;
  };
  $MeTMusic_getLyrics?: () => {
    source: string;
    offset: number;
    lines: { time: number; content: string }[];
  };
}

/** 在页面上下文里跑一段拿 window 的代码(每处都写 as unknown 太吵) */
const api = <T>(page: Page, fn: (w: ApiWindow) => T): Promise<T> =>
  page.evaluate<T>(`(${fn.toString()})(window)`);

const startPlayback = async (page: Page): Promise<void> => {
  await page.goto("/app/#/");
  await page.waitForFunction(() => {
    const w = window as unknown as ApiWindow;
    return typeof w.$MeTMusic_getState === "function" && !!w.__debugStores;
  });
  await api(page, (w) => w.$MeTMusic_next!());
  await expect
    .poll(() => page.title(), { timeout: 15_000 })
    .toMatch(/MeT-Music - .+ - 周杰伦/);
};

test.beforeEach(async ({ page }) => {
  await seedPlayback(page);
});

test("播放状态快照:毫秒口径,暂停后依旧准确", async ({ page }) => {
  await startPlayback(page);

  await expect
    .poll(() => api(page, (w) => w.$MeTMusic_getState!().position), { timeout: 10_000 })
    .toBeGreaterThan(0);

  const playing = await api(page, (w) => w.$MeTMusic_getState!());
  console.log("播放中快照:", playing);
  expect(playing.state).toBe("playing");
  // duration 取自种子的 "03:43" → 223s;毫秒口径应是三位数以上的量级
  expect(playing.duration).toBeGreaterThan(100_000);
  expect(playing.volume).toBeGreaterThan(0);
  expect(playing.isFinished).toBe(false);

  // 暂停:hook tick 停了,但快照现取 store,进度仍要跟着 seek 走
  await api(page, (w) => w.$MeTMusic_pause!());
  await expect
    .poll(() => api(page, (w) => w.$MeTMusic_getState!().state))
    .toBe("paused");

  await api(page, (w) => w.$MeTMusic_seek!(60));
  await expect
    .poll(() => api(page, (w) => w.$MeTMusic_getState!().position))
    .toBeGreaterThan(55_000);
});

test("play / pause 幂等:连发两次不会互相抵消", async ({ page }) => {
  await startPlayback(page);

  await api(page, (w) => {
    w.$MeTMusic_pause!();
    w.$MeTMusic_pause!();
  });
  await expect.poll(() => api(page, (w) => w.$MeTMusic_getState!().state)).toBe("paused");

  await api(page, (w) => {
    w.$MeTMusic_play!();
    w.$MeTMusic_play!();
  });
  await expect.poll(() => api(page, (w) => w.$MeTMusic_getState!().state)).toBe("playing");
});

test("音量:写入后快照与持久化状态同步", async ({ page }) => {
  await startPlayback(page);

  await api(page, (w) => w.$MeTMusic_setVolume!(0.42));
  await expect
    .poll(() => api(page, (w) => w.$MeTMusic_getState!().volume))
    .toBeCloseTo(0.42, 5);

  // 越界值夹到 [0,1],不会把引擎喂出个非法音量
  await api(page, (w) => w.$MeTMusic_setVolume!(5));
  expect(await api(page, (w) => w.$MeTMusic_getState!().volume)).toBe(1);
});

test("轻量快照与完整歌词:曲目信息、行数与来源", async ({ page }) => {
  await startPlayback(page);

  // 种子歌曲无歌词,先塞一份 lrc 进 store(与 stores/music 的 playSongLyric 同形)
  await api(page, (w) => {
    w.__debugStores!.music.setState({
      playSongLyric: {
        hasLrcTran: false,
        hasLrcRoma: false,
        hasYrc: false,
        hasYrcTran: false,
        hasYrcRoma: false,
        lrc: [
          { time: 1.5, content: "第一行", tran: "line one" },
          { time: 3, content: "第二行" },
        ],
        yrc: [],
      },
    });
    w.__debugStores!.status.setState({ playSongLyricIndex: 0 });
  });

  const nowPlaying = await api(page, (w) => w.$MeTMusic_getNowPlaying!());
  console.log("轻量快照:", nowPlaying);
  expect(nowPlaying.artist).toContain("周杰伦");
  expect(nowPlaying.lyricAvailable).toBe(true);
  expect(nowPlaying.lyricLineCount).toBe(2);

  const lyrics = await api(page, (w) => w.$MeTMusic_getLyrics!());
  expect(lyrics.source).toBe("lrc");
  // 秒 → 毫秒
  expect(lyrics.lines[0]!.time).toBe(1500);
  expect(lyrics.lines[0]!.content).toBe("第一行");
});
