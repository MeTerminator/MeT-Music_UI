import { expect, test } from "@playwright/test";
import { seedPlayback, SEED_SONGS, type DebugWindow } from "./seed";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ page }) => {
  await seedPlayback(page);
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
  await page.goto("/app/#/history");
  await page.waitForFunction(() => !!(window as unknown as DebugWindow).__debugStores);
});

test("移动设置说明和控件分行且不溢出", async ({ page }) => {
  await page.evaluate(() => (window as unknown as DebugWindow).__debugStores!.status.setState({ showSettingsPanel: true }));
  const card = page.getByText("全局动态取色类别", { exact: true }).locator("../../..");
  await card.scrollIntoViewIfNeeded();
  const info = (await card.locator(":scope > div").first().boundingBox())!;
  const control = (await card.getByRole("combobox").boundingBox())!;
  const box = (await card.boundingBox())!;
  expect(control.y).toBeGreaterThanOrEqual(info.y + info.height);
  expect(info.width).toBeGreaterThan(200);
  expect(control.x + control.width).toBeLessThanOrEqual(box.x + box.width);
});

test("定位与回顶共用容器、纵向对齐且点击有效", async ({ page }) => {
  await page.evaluate((song) => {
    const stores = (window as unknown as DebugWindow).__debugStores!;
    stores.music.setState({ historyPlaylist: Array.from({ length: 50 }, (_, i) => ({ ...song, id: i === 0 ? song.id : `test-${i}`, name: `歌曲 ${i}` })) });
  }, SEED_SONGS[0]);
  await expect(page.locator("main li")).toHaveCount(50);
  await page.locator("main").evaluate((el) => { el.scrollTop = 900; });
  const locate = page.getByRole("button", { name: "定位歌曲", exact: true });
  const top = page.getByRole("button", { name: "回到顶部", exact: true });
  await expect(locate).toBeVisible();
  await expect(top).toHaveCSS("opacity", "1");
  const a = (await locate.boundingBox())!;
  const b = (await top.boundingBox())!;
  expect(a.x).toBe(b.x);
  expect(b.y - a.y - a.height).toBeGreaterThanOrEqual(12);
  expect(await locate.evaluate((el) => el.parentElement?.id)).toBe("floating-actions");
  await locate.tap();
  await expect(page.locator('li[data-playing="true"]')).toBeInViewport();
  await page.locator("main").evaluate((el) => { el.scrollTop = 900; });
  await expect(top).toHaveCSS("opacity", "1");
  await top.tap();
  await expect.poll(() => page.locator("main").evaluate((el) => el.scrollTop)).toBe(0);
});

for (const useAM of [false, true]) {
  test(`${useAM ? "AMLL" : "普通"}歌词:拖动返回原点不跳进度,轻点可跳转`, async ({ page }) => {
    const seeks: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("[engine] setSeek called")) seeks.push(message.text());
    });
    await page.evaluate((useAMLyrics) => {
      const stores = (window as unknown as DebugWindow).__debugStores!;
      const lrc = Array.from({ length: 20 }, (_, i) => ({ time: i * 10, content: `触屏测试歌词 ${i}` }));
      stores.settings.setState({ useAMLyrics, lyricsBlur: false, useAMSpring: false });
      stores.music.setState({ playSongLyric: {
        hasLrcTran: false, hasLrcRoma: false, hasYrc: false, lrc, yrc: [], yrcAM: [], ttml: [],
        lrcAM: lrc.map((line) => ({ startTime: line.time * 1000, endTime: (line.time + 10) * 1000, isBG: false, isDuet: false, translatedLyric: "", romanLyric: "", words: [{ startTime: line.time * 1000, endTime: (line.time + 10) * 1000, word: line.content }] })),
      } });
      stores.status.setState({ showFullPlayer: true, playSongLyricIndex: 0, playState: true });
    }, useAM);
    await page.getByRole("button", { name: "歌词页", exact: true }).tap();
    const line = page.getByText("触屏测试歌词 1", { exact: true });
    await expect(line).toBeInViewport();
    await page.waitForTimeout(700);
    const box = (await line.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...point, y: point.y - 45 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(100);
    expect(seeks).toHaveLength(0);
    await line.tap();
    await expect.poll(() => seeks.length).toBe(1);
    expect(seeks[0]).toContain("seek = 10");
    for (const label of ["封面页", "歌词页"]) {
      const hit = (await page.getByRole("button", { name: label, exact: true }).boundingBox())!;
      expect(hit.width).toBeGreaterThanOrEqual(44);
      expect(hit.height).toBeGreaterThanOrEqual(44);
    }
  });
}
