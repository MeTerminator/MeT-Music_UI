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
