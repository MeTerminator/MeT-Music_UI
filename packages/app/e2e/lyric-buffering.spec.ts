import { expect, test, type Page } from "@playwright/test";
import { seedPlayback, type DebugWindow } from "./seed";

// 媒体事件 → store 的边界由 core 的原生音频回归测试覆盖。
// 这里验证真实 AMLL Web Animations 在媒体时钟停住时也停止，并在恢复时校准。
async function wordAnimations(page: Page) {
  return page.evaluate(() => document.getAnimations().filter((animation) => {
    const target = (animation.effect as KeyframeEffect | null)?.target;
    return animation.id.startsWith("fade-word-") && Number(animation.currentTime) > 0 && target instanceof Element &&
      target.closest(".amll-lyric-player");
  }).map((animation) => ({ state: animation.playState, time: Number(animation.currentTime) })));
}

test("缓冲时逐字动画暂停，媒体时间不变时恢复也重新校准", async ({ page }) => {
  await seedPlayback(page);
  await page.route("http://localhost:3000/api/**", (route) => route.fulfill({ json: {
    code: 200, source: "network", lrc: "", lrctrans: "", qrc: "", qrctrans: "", qrcroma: "",
  } }));
  await page.goto("/app/#/");
  await page.waitForFunction(() => !!(window as unknown as DebugWindow).__debugStores);
  await page.waitForFunction(() =>
    (window as unknown as DebugWindow).__debugStores!.music.getState().playSongLyricStatus === "ready");
  await page.evaluate(() => {
    const stores = (window as unknown as DebugWindow).__debugStores!;
    const lrcAM = Array.from({ length: 6 }, (_, i) => ({
      startTime: i * 60000, endTime: (i + 1) * 60000,
      words: [
        { startTime: i * 60000, endTime: i * 60000 + 30000, word: "缓冲同步" },
        { startTime: i * 60000 + 30000, endTime: (i + 1) * 60000, word: `歌词${i}` },
      ],
      translatedLyric: "", romanLyric: "", isBG: false, isDuet: false,
    }));
    stores.music.setState({ playSongLyric: {
      hasLrcTran: false, hasLrcRoma: false, hasYrc: true, hasYrcTran: false, hasYrcRoma: false,
      lrc: [], lrcAM, yrc: [], yrcAM: lrcAM, ttml: [],
    } });
    // 不启动模拟时钟，手动控制媒体时钟，复现 Safari 缓冲期间时间不变。
    stores.status.setState({ showFullPlayer: true, lyricViewMode: "only",
      playState: true, playSeekMs: 10000, playBuffering: false });
  });
  await expect(page.locator(".amll-lyric-player")).toBeVisible();
  await expect.poll(async () => (await wordAnimations(page)).some((a) => a.state === "running")).toBe(true);

  await page.evaluate(() => (window as unknown as DebugWindow).__debugStores!.status.setState({ playBuffering: true }));
  await expect.poll(async () => (await wordAnimations(page)).every((a) => a.state === "paused")).toBe(true);
  const paused = await wordAnimations(page);
  expect(paused.length).toBeGreaterThan(0);
  await page.waitForTimeout(1200); // 模拟缓冲；必须跨过多帧验证动画没有自行推进。
  const waiting = await wordAnimations(page);
  expect(waiting.map((a) => a.time)).toEqual(paused.map((a) => a.time));

  await page.evaluate(() => (window as unknown as DebugWindow).__debugStores!.status.setState({ playBuffering: false }));
  await expect.poll(async () => (await wordAnimations(page)).some((a) => a.state === "running")).toBe(true);
  await expect.poll(async () => Math.max(...(await wordAnimations(page)).map((a) => a.time))).toBeLessThan(10600);
  const resumed = await wordAnimations(page);
  for (const animation of resumed) {
    // WebKit 的动画时钟使用浮点秒，10000ms 可能读回为 9999.999…。
    expect(animation.time).toBeGreaterThanOrEqual(9990);
    expect(animation.time).toBeLessThan(10600);
  }
});
