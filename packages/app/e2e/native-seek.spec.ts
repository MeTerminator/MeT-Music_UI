import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { seedPlayback } from "./seed";

const engineUrl = "/app/@fs" + fileURLToPath(new URL("../../core/src/player/engine.ts", import.meta.url));

// 使用真实 HTMLAudioElement/Howler，不走 simulationPlaying 时钟。
function silentWav() {
  const samples = 180 * 8000;
  const wav = Buffer.alloc(44 + samples, 128);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples, 4);
  wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28);
  wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34);
  wav.write("data", 36); wav.writeUInt32LE(samples, 40);
  return wav;
}

test("真实原生音频：进度条和歌词点击只定位一次，播放中不暂停重启", async ({ page }) => {
  await seedPlayback(page);
  await page.route("http://localhost:3000/api/**", (route) => route.fulfill({ json: {
    code: 200, source: "network", lrc: "", lrctrans: "", qrc: "", qrctrans: "", qrcroma: "",
  } }));
  const wav = silentWav();
  await page.route("**/native-seek.wav", (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || "");
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: "audio/wav",
      headers: { "accept-ranges": "bytes", ...(range ? { "content-range": `bytes ${start}-${end}/${wav.length}` } : {}) },
      body: wav.subarray(start, end + 1) });
  });
  await page.goto("/app/#/");
  // 本用例验证媒体定位，固定控制条位置以免指针落在展开动画中的暂停按钮。
  await page.addStyleTag({ content: ".met-fp-in { animation: none !important; } * { transition-duration: 0s !important; }" });
  await page.waitForFunction(() => (window as any).__debugStores?.music.getState().playSongLyricStatus === "ready");
  await page.evaluate(async (engineUrl) => {
    const w = window as any;
    w.__debugStores.settings.setState({ simulationPlaying: false, html5Player: true,
      useMusicCache: false, songVolumeFade: false, useAMLyrics: true });
    const engine = await import(engineUrl);
    await engine.createPlayer(`${location.origin}/app/native-seek.wav`, false);
  }, engineUrl);
  await expect.poll(() => page.evaluate(async (url) => (await import(url)).getPlayerInstance()?.state(), engineUrl)).toBe("loaded");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).$MeTMusic_getState().state)).toBe("playing");

  await page.evaluate(async (url) => {
    const w = window as any;
    const engine = await import(url);
    const audio = engine.getPlayerInstance()._sounds[0]._node as HTMLAudioElement;
    w.__nativeSeek = { audio, writes: [] as number[], pauses: 0, plays: 0 };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime")!;
    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      get() { return descriptor.get!.call(this); },
      set(value: number) { w.__nativeSeek.writes.push(value); descriptor.set!.call(this, value); },
    });
    const pause = audio.pause.bind(audio);
    const play = audio.play.bind(audio);
    audio.pause = () => { w.__nativeSeek.pauses++; pause(); };
    audio.play = () => { w.__nativeSeek.plays++; return play(); };
    const lines = Array.from({ length: 6 }, (_, i) => ({
      startTime: i * 30000, endTime: (i + 1) * 30000,
      words: [
        { startTime: i * 30000, endTime: i * 30000 + 15000, word: `原生定位${i}` },
        { startTime: i * 30000 + 15000, endTime: (i + 1) * 30000, word: "歌词" },
      ], translatedLyric: "", romanLyric: "", isBG: false, isDuet: false,
    }));
    w.__debugStores.music.setState({ playSongLyric: {
      hasYrc: true, hasLrcTran: false, hasLrcRoma: false, hasYrcTran: false, hasYrcRoma: false,
      lrc: [], lrcAM: lines, yrc: [], yrcAM: lines, ttml: [],
    } });
    w.__debugStores.status.setState({ showFullPlayer: true, lyricViewMode: "only" });
  }, engineUrl);
  await expect(page.locator(".amll-lyric-player")).toBeVisible();
  await page.locator(".met-fp-in").evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))));

  for (const [index, seconds] of [60, 20, 110].entries()) {
    const bar = page.getByRole("group", { name: "播放进度", exact: true }).filter({ visible: true }).last();
    const thumb = bar.locator("div[data-index='0']");
    await bar.hover();
    const box = (await bar.boundingBox())!;
    const thumbBox = (await thumb.boundingBox())!;
    await page.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 7 + (box.width - 14) * seconds / 180, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate((seconds) => Math.abs((window as any).__nativeSeek.audio.currentTime - seconds), seconds)).toBeLessThan(1);
    const diagnostics = await page.evaluate(() => {
      const { writes, pauses, plays, audio } = (window as any).__nativeSeek;
      return { writes, pauses, plays, paused: audio.paused, ui: (window as any).$MeTMusic_getState().position, media: audio.currentTime };
    });
    expect(diagnostics.writes).toHaveLength(index + 1);
    expect(diagnostics.pauses).toBe(0);
    expect(diagnostics.plays).toBe(0);
    expect(diagnostics.paused).toBe(false);
    expect(Math.abs(diagnostics.ui / 1000 - diagnostics.media)).toBeLessThan(0.1);
  }

  await page.locator(".amll-lyric-player").getByText("原生定位2", { exact: true }).click();
  await expect.poll(() => page.evaluate(() => Math.abs((window as any).__nativeSeek.audio.currentTime - 60))).toBeLessThan(1);
  expect(await page.evaluate(() => (window as any).__nativeSeek.writes)).toEqual([
    expect.closeTo(60, 0), expect.closeTo(20, 0), expect.closeTo(110, 0), 60,
  ]);
  expect(await page.evaluate(() => (window as any).__nativeSeek.pauses)).toBe(0);
  expect(await page.evaluate(() => (window as any).__nativeSeek.plays)).toBe(0);

  // 暂停时进度条仅定位；再次播放仍从该位置继续。
  await page.getByRole("button", { name: "暂停", exact: true }).filter({ visible: true }).last().click();
  await expect.poll(() => page.evaluate(() => (window as any).__nativeSeek.audio.paused)).toBe(true);
  await page.getByRole("slider", { name: "播放进度", exact: true }).filter({ visible: true }).last().press("Home");
  await expect.poll(() => page.evaluate(() => (window as any).__nativeSeek.audio.currentTime)).toBeLessThan(0.05);
  expect(await page.evaluate(() => (window as any).__nativeSeek.writes.at(-1))).toBe(0);
  expect(await page.evaluate(() => (window as any).__nativeSeek.audio.paused)).toBe(true);
  await page.getByRole("button", { name: "播放", exact: true }).filter({ visible: true }).last().click();
  await expect.poll(() => page.evaluate(() => (window as any).__nativeSeek.audio.currentTime)).toBeGreaterThan(0.1);
});
