import { vividDesktopLyricColor } from "../src/platform/desktop-lyric-color";
import { expect, test } from "@playwright/test";
import { seedPlayback } from "./seed";

test("host capability sends full songs once, compact progress every 0.5s, and paused seeks immediately", async ({ page }) => {
  await seedPlayback(page);
  await page.goto("/app/#/");
  await page.waitForFunction(() => Boolean((window as any).__debugStores));
  const result = await page.evaluate(async () => {
    const w = window as any;
    const { music, status, settings } = w.__debugStores;
    const path = "/app/src/host/index.ts";
    const { broadcastHook } = await import(path);
    const messages: any[] = [];
    let legacy = 0;
    w.$MeTMusic_Hook = () => { legacy++; };
    status.setState({ playState: false, playLoading: false, playRate: 1,
      playTimeData: { ...status.getState().playTimeData, currentTime: 0, duration: 100 } });
    music.setState({ playSongLyric: { ...music.getState().playSongLyric,
      hasTtml: false, hasYrc: false, lrc: [{ time: 1, content: "第一行" }], yrc: [] } });
    settings.setState({ lyricsOffset: 0, lyricsShiftMs: 0 });
    let now = 100000;
    const originalNow = Date.now;
    Date.now = () => now;
    legacy = 0;
    try {
      w.$MeTMusic_registerHost({ onPlaybackSync: (data: any) => messages.push(data) });
      const initial = messages.splice(0);
      status.setState({ playTimeData: { ...status.getState().playTimeData, currentTime: 15 } });
      const pausedSeek = messages.splice(0);
      broadcastHook();
      const pausedIdle = messages.splice(0);
      status.setState({ playState: true });
      messages.length = 0;
      for (let i = 1; i <= 300; i++) {
        now = 100000 + i * 10;
        status.setState({ playTimeData: { ...status.getState().playTimeData, currentTime: 15 + i / 100 } });
        broadcastHook();
      }
      const playing = messages.splice(0);
      const publicData = w.$MeTMusic_Data;
      status.setState({ playState: false });
      const pause = messages.splice(0);
      music.setState({ playSongLyric: { ...music.getState().playSongLyric,
        lrc: [{ time: 2, content: "修改后的歌词" }] } });
      const changedLyrics = messages.splice(0);
      settings.setState({ lyricsShiftMs: 1000 });
      const changedOffset = messages.splice(0);
      status.setState({ coverTheme: { dark: {}, light: { shadeTwo: "1, 2, 3" } } });
      const changedCover = messages.splice(0);
      const legacyBeforeFallback = legacy;
      w.$MeTMusic_registerHost({});
      broadcastHook();
      return { initial, pausedSeek, pausedIdle, playing, pause, changedLyrics, changedOffset,
        changedCover, publicData, legacyBeforeFallback, legacy };
    } finally { Date.now = originalNow; }
  });
  expect(result.initial).toHaveLength(1);
  expect(result.initial[0]).toMatchObject({ kind: "song", lyrics: [{ content: "第一行" }], timestamp: 100000 });
  expect(result.pausedSeek).toHaveLength(1);
  expect(result.pausedSeek[0]).toMatchObject({ kind: "progress", currentTime: 15, isPlaying: false });
  expect(result.pausedIdle).toHaveLength(0);
  expect(result.publicData).toMatchObject({ currentTime: 18, isPlaying: true });
  expect(result.playing).toHaveLength(6);
  for (const [index, progress] of result.playing.entries()) {
    expect(progress).toMatchObject({ kind: "progress", currentTime: 15 + (index + 1) * 0.5,
      timestamp: 100000 + (index + 1) * 500 });
  }
  expect(result.playing[0]).not.toHaveProperty("lyrics");
  expect(result.playing[0]).not.toHaveProperty("coverUrl");
  expect(result.pause[0]).toMatchObject({ kind: "progress", currentTime: 18, isPlaying: false });
  expect(result.changedLyrics[0]).toMatchObject({ kind: "song", lyrics: [{ content: "修改后的歌词" }] });
  expect(result.changedOffset[0]).toMatchObject({ kind: "song", lineOffset: -1000 });
  expect(result.changedCover[0]).toMatchObject({ kind: "song", coverTheme: { light: { shadeTwo: vividDesktopLyricColor("1, 2, 3") } } });
  expect(result.legacyBeforeFallback).toBe(0);
  expect(result.legacy).toBeGreaterThan(0);
});

test("real simulated engine sends paused seek immediately and freezes afterward", async ({ page }) => {
  await seedPlayback(page);
  await page.goto("/app/#/");
  await page.waitForFunction(() => Boolean((window as any).__debugStores));
  await page.evaluate(() => (window as any).$MeTMusic_next());
  await expect.poll(() => page.evaluate(() => (window as any).$MeTMusic_getState().state)).toBe("playing");
  const result = await page.evaluate(() => {
    const w = window as any;
    w.$MeTMusic_pause();
    const messages: any[] = [];
    w.$MeTMusic_registerHost({ onPlaybackSync: (data: any) => messages.push(data) });
    messages.length = 0;
    w.$MeTMusic_seek(60);
    return { messages, storeTime: w.__debugStores.status.getState().playTimeData.currentTime };
  });
  expect(result.storeTime).toBe(60);
  expect(result.messages.length).toBeGreaterThan(0);
  expect(result.messages.at(-1)).toMatchObject({ kind: "progress", currentTime: 60, isPlaying: false });
});
