import { expect, test, type Page } from "@playwright/test";
import type { DebugWindow } from "./seed";

const openLyricSettings = async (page: Page) => {
  await page.waitForFunction(() => !!(window as unknown as DebugWindow).__debugStores);
  await page.evaluate(() => {
    (window as unknown as DebugWindow).__debugStores!.status.setState({ showSettingsPanel: true });
  });
  await page.getByRole("navigation", { name: "设置分类" }).getByRole("button", { name: "歌词", exact: true }).click();
};
const lyricText = (page: Page) => page.evaluate(() => {
  const lyric = (window as unknown as DebugWindow).__debugStores!.music.getState().playSongLyric as { lrc: { content: string }[] };
  return lyric.lrc[0]?.content;
});

test("默认关闭，开关即时补全/恢复；持久化原文并记住开关", async ({ page }) => {
  await page.goto("/app/#/");
  await openLyricSettings(page);
  const toggle = page.getByRole("switch", { name: "歌词脏字补全", exact: true });
  await expect(toggle).not.toBeChecked();
  await page.evaluate(() => {
    (window as unknown as DebugWindow).__debugStores!.music.setState({
      playSongLyric: {
        hasLrcTran: false, hasLrcRoma: false, hasYrc: false, hasYrcTran: false, hasYrcRoma: false,
        lrc: [{ time: 0, content: "f**k sh*tting b*tches d**n ecst*cy" }], yrc: [],
      },
    });
  });
  const masked = "f**k sh*tting b*tches d**n ecst*cy";
  const restored = "fuck shitting bitches damn ecstacy";
  expect(await lyricText(page)).toBe(masked);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect.poll(() => lyricText(page)).toBe(restored);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("musicData")!).playSongLyric.lrc[0].content)).toBe(masked);
  await toggle.click();
  await expect.poll(() => lyricText(page)).toBe(masked);
  await toggle.click();
  await page.reload();
  await openLyricSettings(page);
  await expect(toggle).toBeChecked();
  await expect.poll(() => lyricText(page)).toBe(restored);
  await toggle.click();
  await expect.poll(() => lyricText(page)).toBe(masked);
});
