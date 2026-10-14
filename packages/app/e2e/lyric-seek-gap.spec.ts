import { expect, test, type Page } from "@playwright/test";
import { seedPlayback, type DebugWindow } from "./seed";

// 显式留出前奏、间奏和尾奏,避免真实歌词接口使回归结果不稳定。
const LRC = [20, 26, 32, 38, 44, 100, 106, 112, 118, 124].map((time, i) => ({
  time, content: `定位测试歌词 ${i}`,
}));
const AM = LRC.map((line) => ({
  startTime: line.time * 1000, endTime: (line.time + 4) * 1000,
  words: [{ startTime: line.time * 1000, endTime: (line.time + 4) * 1000, word: line.content }],
  translatedLyric: "", romanLyric: "", isBG: false, isDuet: false,
}));

async function prepare(page: Page, useAM: boolean, paused: boolean) {
  await seedPlayback(page);
  await page.addInitScript((useAMLyrics) => {
    const settings = JSON.parse(localStorage.getItem("siteSettings") || "{}");
    localStorage.setItem("siteSettings", JSON.stringify({ ...settings, useAMLyrics, lyricsBlur: false }));
  }, useAM);
  await page.route("http://localhost:3000/api/**", (route) => route.fulfill({ json: {
    code: 200, source: "network", lrc: "", lrctrans: "", qrc: "", qrctrans: "", qrcroma: "",
  } }));
  await page.goto("/app/#/");
  await page.waitForFunction(() => !!(window as unknown as DebugWindow).__debugStores);
  await page.evaluate(() => (window as unknown as DebugWindow).$MeTMusic_next!());
  await page.waitForFunction(() => (window as unknown as DebugWindow).__debugStores!.status.getState().playTimeData.currentTime > 0);
  if (paused) {
    await page.evaluate(() => (window as unknown as { $MeTMusic_playOrPause: () => void }).$MeTMusic_playOrPause());
  }
  await page.evaluate(({ lrc, lrcAM }) => {
    const stores = (window as unknown as DebugWindow).__debugStores!;
    stores.music.setState({ playSongLyric: {
      hasLrcTran: false, hasLrcRoma: false, hasYrc: false, hasYrcTran: false, hasYrcRoma: false,
      lrc, lrcAM, yrc: [], yrcAM: [], ttml: [],
    } });
    stores.status.setState({ showFullPlayer: true, lyricViewMode: "only" });
  }, { lrc: LRC, lrcAM: AM });
  await expect(page.locator(useAM ? ".amll-lyric-player" : "[data-lrc-index='0']")).toBeVisible();
}

async function seek(page: Page, seconds: number) {
  await page.mouse.move(600, 700);
  const bar = page.getByRole("group", { name: "播放进度", exact: true }).filter({ visible: true }).last();
  await bar.hover(); // 等待全屏展开动画和控制条位置稳定。
  const box = (await bar.boundingBox())!;
  const x = box.x + 7 + (box.width - 14) * seconds / 223;
  await page.mouse.move(box.x + 7, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as DebugWindow).__debugStores!.status.getState() as unknown as { playSeek: number },
  ).then((state) => Math.abs(state.playSeek - seconds))).toBeLessThan(2);
}

async function linePosition(page: Page, useAM: boolean, index: number) {
  const line = useAM
    ? page.locator(".amll-lyric-player").getByText(LRC[index].content, { exact: true })
    : page.locator(`[data-lrc-index='${index}']`);
  const box = (await line.boundingBox())!;
  const container = useAM
    ? page.locator(".amll-lyric-player")
    : page.locator(".lyric-font").filter({ has: page.locator("[data-lrc-index]") });
  const viewport = (await container.boundingBox())!;
  return (box.y + box.height / 2 - viewport.y) / viewport.height;
}

for (const useAM of [true, false]) {
  for (const paused of [true, false]) {
    test(`${useAM ? "AM" : "普通"}歌词:${paused ? "暂停" : "播放"}时拖动到无歌词区间仍定位`, async ({ page }) => {
      await prepare(page, useAM, paused);
      await seek(page, 120);
      await expect.poll(() => linePosition(page, useAM, 8)).toBeGreaterThan(0.15);
      await expect.poll(() => linePosition(page, useAM, 8)).toBeLessThan(0.75);

      await seek(page, 5); // 前奏回到首句,索引 -1 不应让视口停留在末尾。
      await expect.poll(() => linePosition(page, useAM, 0)).toBeGreaterThan(0.15);
      await expect.poll(() => linePosition(page, useAM, 0)).toBeLessThan(0.75);

      await seek(page, 65); // AM 对齐下一句;普通 lrc 沿用上一句的时间区间。
      const gapIndex = useAM ? 5 : 4;
      await expect.poll(() => linePosition(page, useAM, gapIndex)).toBeGreaterThan(0.15);
      await expect.poll(() => linePosition(page, useAM, gapIndex)).toBeLessThan(0.75);

      // 手动浏览后仍在同一间奏内跳转,索引不变也必须恢复跟随。
      const lyric = page.locator(useAM ? ".amll-lyric-player" : "[data-lrc-index='4']");
      await lyric.hover();
      await page.mouse.wheel(0, 400);
      await seek(page, 75);
      await expect.poll(() => linePosition(page, useAM, gapIndex)).toBeGreaterThan(0.15);
      await expect.poll(() => linePosition(page, useAM, gapIndex)).toBeLessThan(0.75);

      await seek(page, 185); // 尾奏应滚动到歌词末尾。
      await expect.poll(() => linePosition(page, useAM, 9)).toBeLessThan(0.75);

      await seek(page, 7); // 再次回到前奏,验证双向跳转。
      await expect.poll(() => linePosition(page, useAM, 0)).toBeGreaterThan(0.15);
      await expect.poll(() => linePosition(page, useAM, 0)).toBeLessThan(0.75);
    });
  }
}
