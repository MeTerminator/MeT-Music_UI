import { expect, test } from "@playwright/test";
import { seedPlayback, type DebugWindow } from "./seed";

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
});

for (const width of [390, 1280]) {
  test(`设置分类、数值保存与边界校验 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app/#/setting");
    const nav = page.getByRole("navigation", { name: "设置分类" });
    await nav.getByRole("button", { name: "歌词", exact: true }).click();
    const font = page.getByRole("spinbutton", { name: "歌词字号数值" });
    await expect(font).toHaveValue("42");
    await expect(page.getByRole("spinbutton", { name: "歌词字重数值" })).toHaveValue("700");
    const navBox = (await nav.boundingBox())!;
    const fontBox = (await font.boundingBox())!;
    expect(navBox.x + navBox.width).toBeLessThan(fontBox.x);
    expect(await page.locator("main").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await font.fill("64");
    await font.press("Enter");
    const weight = page.getByRole("spinbutton", { name: "歌词字重数值" });
    await weight.fill("650");
    await weight.press("Enter");
    const focus = page.getByRole("spinbutton", { name: "AMLL 聚焦行位置数值" });
    await focus.fill("0.65");
    await focus.press("Enter");
    await font.fill("999");
    await font.press("Enter");
    await expect(font).toHaveValue("96");
    await page.reload();
    await nav.getByRole("button", { name: "歌词", exact: true }).click();
    await expect(font).toHaveValue("96");
    await expect(weight).toHaveValue("650");
    await expect(focus).toHaveValue("0.65");
    await nav.getByRole("button", { name: "播放", exact: true }).click();
    const ratio = page.getByRole("spinbutton", { name: "封面/歌词占比数值" });
    await ratio.fill("60");
    await ratio.press("Enter");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("siteSettings") || "{}"));
    expect(stored.coverLyricRatio).toBe(0.6);
    await page.screenshot({ path: `/tmp/met-settings-${width}.png`, fullPage: true });
  });
}

test("暂停时 AMLL 字号、样式与封面布局实际生效", async ({ page }) => {
  await seedPlayback(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/app/#/history");
  await page.waitForFunction(() => !!(window as unknown as DebugWindow).__debugStores);
  await page.evaluate(() => {
    const stores = (window as unknown as DebugWindow).__debugStores! as NonNullable<DebugWindow["__debugStores"]> & { settings: { setState: (patch: Record<string, unknown>) => void } };
    stores.settings.setState({ coverLayout: "fullscreen", coverLyricRatio: 0.6, amllLineWidth: 0.9, amllLinePadding: 0.5, amllBGLineScale: 0.8 });
    const lines = Array.from({ length: 8 }, (_, i) => ({ time: i * 10, content: `样式验证歌词 ${i}` }));
    stores.music.setState({
      playSongData: { ...stores.music.getState().playSongData as object, localCover: "/app/images/pic/pointer.png" },
      playSongLyric: { hasLrcTran: false, hasLrcRoma: false, hasYrc: false, lrc: lines, yrc: [], yrcAM: [], ttml: [], lrcAM: lines.map((line) => ({ startTime: line.time * 1000, endTime: (line.time + 10) * 1000, isBG: false, isDuet: false, translatedLyric: "", romanLyric: "", words: [{ startTime: line.time * 1000, endTime: (line.time + 10) * 1000, word: line.content }] })) },
    });
    stores.status.setState({ showFullPlayer: true, playState: false, lyricViewMode: "both" });
  });
  const player = page.locator(".amll-lyric-player");
  await expect(player).toBeVisible();
  await expect(page.getByText("样式验证歌词 0", { exact: true })).toBeVisible();
  await expect(player).toHaveCSS("font-size", "42px");
  await expect(player).toHaveCSS("font-weight", "700");
  expect(await player.evaluate((el) => getComputedStyle(el).getPropertyValue("--amll-lp-line-width-aspect").trim())).toBe("0.9");
  const cover = page.getByTestId("full-cover-art");
  await expect(cover).toBeVisible();
  await expect.poll(async () => (await cover.boundingBox())!.width).toBe(768);
  await expect(page.locator("svg.lucide-mic-vocal")).toBeVisible();
  await expect(page.locator("svg.lucide-disc-3")).toBeVisible();
  await page.screenshot({ path: "/tmp/met-full-player.png" });
});
