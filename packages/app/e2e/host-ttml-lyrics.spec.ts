import { expect, test } from "@playwright/test";
import { seedPlayback } from "./seed";

test("宿主 Hook 优先推送 TTML 后触发的主唱/对唱，过滤背景人声并应用时间平移", async ({ page }) => {
  await seedPlayback(page);
  await page.goto("/app/#/");
  await page.waitForFunction(() => Boolean((window as any).__debugStores));
  const result = await page.evaluate(async () => {
    const w = window as any;
    const { music, status, settings } = w.__debugStores;
    const modulePath = "/app/src/host/index.ts";
    const { broadcastHook, buildNowPlaying } = await import(modulePath);
    const line = (text: string, startTime: number, flags = {}) => ({
      startTime, endTime: startTime + 2000,
      words: [{ word: text, startTime, endTime: startTime + 2000, romanWord: "", obscene: false }],
      translatedLyric: `${text}翻译`, romanLyric: "", isBG: false, isDuet: false, ...flags,
    });
    const lyrics = {
      ...music.getState().playSongLyric,
      hasTtml: true,
      hasYrc: false,
      lrc: [{ time: 0, content: "普通歌词" }],
      ttml: [line("主唱", 1000), line("对唱", 1500, { isDuet: true }), line("背景", 1800, { isBG: true })],
    };
    music.setState({ playSongLyric: lyrics, playSongData: {
      ...music.getState().playSongData,
      name: "测试歌曲",
      artists: [{ name: "歌手 1" }, { name: "歌手 2" }, { name: "歌手 3" }],
    } });
    // TTML 推送不受普通逐字开关和普通歌词偏移影响。
    settings.setState({ showYrc: false, lyricsOffset: 5, lyricsHookOffset: 5,
      lyricsShiftMs: 0, lyricsAMttmlUseOffset: false });
    let latest: any;
    w.$MeTMusic_Hook = (payload: any) => { latest = payload; };
    const at = (seconds: number) => {
      status.setState({ playTimeData: { ...status.getState().playTimeData, currentTime: seconds }, playSongLyricIndex: 0 });
      broadcastHook();
      return latest;
    };
    const overlap = at(2);
    const rewind = at(1.2);
    const intro = at(0.5);
    // 用相同平移时间选择歌词行与计算逐字进度。
    settings.setState({ lyricsShiftMs: 1000, lyricsAMttmlUseOffset: true, lyricsAMOffset: 200 });
    const shifted = at(2); // 有效时间 1200ms
    settings.setState({ lyricsShiftMs: 0, lyricsAMttmlUseOffset: true, lyricsAMOffset: 2000 });
    const nowPlaying = buildNowPlaying(); // 未播放时 getSeek()=0，有效时间 2000ms
    music.setState({ playSongLyric: { ...lyrics, hasTtml: false, ttml: [] } });
    const fallback = at(2);
    status.setState({ playSongLyricIndex: -1 });
    broadcastHook();
    const lrcIntro = latest;
    w.$MeTMusic_Hook = null;
    return { overlap, rewind, intro, shifted, nowPlaying, fallback, lrcIntro };
  });
  expect(result.overlap).toMatchObject({ contractVersion: 2, lyricText: "对唱", lyricTrans: "对唱翻译",
    lyricData: [{ content: "对唱", percent: 0.25 }] });
  expect(result.rewind.lyricText).toBe("主唱");
  expect(result.intro).toMatchObject({
    lyricText: "测试歌曲 - 歌手 1 / 歌手 2 / 歌手 3", lyricTrans: "", lyricData: [],
  });
  expect(result.lrcIntro).toMatchObject({
    lyricText: "测试歌曲 - 歌手 1 / 歌手 2 / 歌手 3", lyricTrans: "", lyricData: [],
  });
  expect(result.shifted).toMatchObject({ lyricText: "主唱", lyricData: [{ content: "主唱", percent: 0.1 }] });
  expect(result.nowPlaying).toMatchObject({ lyricText: "对唱", lyricLineCount: 2, lyricAvailable: true });
  expect(result.fallback).toMatchObject({ lyricText: "普通歌词", lyricData: [] });
});

test("底栏歌词按桌面规则选择 TTML 和逐字进度，无 TTML 时回退", async ({ page }) => {
  await seedPlayback(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.fulfill({ status: 404, json: {} }));
  await page.goto("/app/#/");
  await page.waitForFunction(() => Boolean((window as any).__debugStores));
  await page.evaluate(() => {
    const { music, status, settings } = (window as any).__debugStores;
    const line = (word: string, startTime: number, isBG = false, isDuet = false) => ({
      startTime, endTime: startTime + 2000, isBG, isDuet,
      words: [{ word, startTime, endTime: startTime + 2000, romanWord: "", obscene: false }],
      translatedLyric: "", romanLyric: "",
    });
    music.setState({
      playSongLyric: {
        ...music.getState().playSongLyric,
        hasTtml: true,
        ttml: [line("底栏主唱", 1000), line("底栏对唱", 1500, false, true), line("底栏背景", 1800, true)],
        hasYrc: true,
        yrc: [{ time: 0, endTime: 10, content: [{ content: "底栏逐字", time: 0, duration: 10, endsWithSpace: false }] }],
        lrc: [{ time: 0, content: "底栏普通歌词" }],
      },
    });
    settings.setState({
      bottomLyricShow: true, showYrc: false, showYrcAnimation: true,
      lyricsOffset: 5, lyricsHookOffset: 5, lyricsShiftMs: 0, lyricsAMttmlUseOffset: false,
    });
    status.setState({
      playState: true, playSongLyricIndex: -1,
      playTimeData: { ...status.getState().playTimeData, currentTime: 2 },
    });
  });

  const duet = page.getByText("底栏对唱", { exact: true });
  await expect(duet).toBeVisible();
  await expect(duet).toHaveCSS("background-position-x", "75%");
  await expect(page.getByText("底栏背景", { exact: true })).toHaveCount(0);

  await page.evaluate(() => {
    const { status, settings } = (window as any).__debugStores;
    settings.setState({ lyricsShiftMs: 1000, lyricsAMttmlUseOffset: true, lyricsAMOffset: 200 });
    status.setState({ playTimeData: { ...status.getState().playTimeData, currentTime: 2 } });
  });
  const main = page.getByText("底栏主唱", { exact: true });
  await expect(main).toBeVisible();
  await expect(main).toHaveCSS("background-position-x", "90%");

  await page.evaluate(() => {
    const { status } = (window as any).__debugStores;
    status.setState({
      playTimeData: { ...status.getState().playTimeData, currentTime: 0.5 },
      playSongLyricIndex: 0,
    });
  });
  await expect(main).toHaveCount(0);
  await expect(page.getByText("底栏普通歌词", { exact: true })).toHaveCount(0);

  await page.evaluate(() => {
    const { music } = (window as any).__debugStores;
    music.setState({ playSongLyric: { ...music.getState().playSongLyric, hasTtml: false, ttml: [] } });
  });
  await expect(page.getByText("底栏普通歌词", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const { status, settings } = (window as any).__debugStores;
    settings.setState({ showYrc: true });
    status.setState({
      playTimeData: { ...status.getState().playTimeData, currentTime: 2 },
      playSongLyricIndex: 0,
    });
  });
  await expect(page.getByText("底栏逐字", { exact: true })).toHaveCSS("background-position-x", "30%");
});
