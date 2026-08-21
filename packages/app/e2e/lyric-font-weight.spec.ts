import { expect, test } from "@playwright/test";
import { type DebugWindow } from "./seed";

/**
 * 歌词字重设置。
 * settings.lyricFontWeight 为 0 时跟随所选歌词字体自带的字重(保持加此设置前的观感),
 * 非 0 时覆盖;最终写入 html 的 --met-lyric-font-weight,由 styles.css 的 .lyric-font 消费。
 */
test.use({ viewport: { width: 1280, height: 800 } });

const weightVar = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--met-lyric-font-weight").trim(),
  );
const setSetting = (page: import("@playwright/test").Page, patch: Record<string, unknown>) =>
  page.evaluate(
    (p) => (window as unknown as DebugWindow).__debugStores!.settings.setState(p),
    patch,
  );

test("字重可自由设置,0 则跟随字体", async ({ page }) => {
  await page.goto("/app/#/");
  await page.waitForFunction(() => !!(window as unknown as { __debugStores?: unknown }).__debugStores);

  // 默认:跟随字体(默认歌词字体 harmony_bold → bold)
  expect(await weightVar(page)).toBe("bold");

  for (const w of [100, 400, 900]) {
    await setSetting(page, { lyricFontWeight: w });
    await page.waitForTimeout(120);
    expect(await weightVar(page)).toBe(String(w));
  }

  // 回到跟随字体
  await setSetting(page, { lyricFontWeight: 0 });
  await page.waitForTimeout(120);
  expect(await weightVar(page)).toBe("bold");

  // 跟随字体时随字体变化(Regular 字体自带 normal)
  await setSetting(page, { lyricFont: "harmony_reg" });
  await page.waitForTimeout(120);
  expect(await weightVar(page)).toBe("normal");

  // 覆盖优先于字体自带字重
  await setSetting(page, { lyricFontWeight: 800 });
  await page.waitForTimeout(120);
  expect(await weightVar(page)).toBe("800");
});

test("设置面板「歌词」分组里有该项", async ({ page }) => {
  await page.goto("/app/#/");
  await page.waitForFunction(() => !!(window as unknown as { __debugStores?: unknown }).__debugStores);
  await page.evaluate(() =>
    (window as unknown as DebugWindow).__debugStores!.status.setState({ showSettingsPanel: true }),
  );
  await expect(page.getByText("歌词字重")).toBeVisible();
});
