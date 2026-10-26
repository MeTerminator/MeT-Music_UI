import { expect, test, type Page } from "@playwright/test";
import type { DebugWindow } from "./seed";

async function openLyricSettings(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as DebugWindow).__debugStores);
  await page.evaluate(() => (window as unknown as DebugWindow).__debugStores!.status.setState({ showSettingsPanel: true }));
  await page.getByRole("navigation", { name: "设置分类" }).getByRole("button", { name: "歌词", exact: true }).click();
}

test("普通歌词与 TTML 跨刷新复用缓存，设置有效期、永久及关闭均生效", async ({ page }) => {
  const requests = { normal: 0, ttml: 0 };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();
    if (path.endsWith("/lyric/new")) {
      requests.normal++;
      return route.fulfill({ json: { code: 200, source: "network", lrc: "[00:01]缓存歌词", lrctrans: "", qrc: "", qrctrans: "", qrcroma: "" } });
    }
    if (path.endsWith("/lyric/ttml")) {
      requests.ttml++;
      return route.fulfill({ json: { status: "success", content: "<tt>缓存 TTML</tt>" } });
    }
    if (path.endsWith("/song/detail")) return route.fulfill({ json: {} });
    return route.fulfill({ status: 404, json: { detail: "Offline test" } });
  });
  await page.goto("/app/#/download?id=cache-test");
  await expect(page.getByText("TTML 歌词", { exact: true })).toBeVisible();
  expect(requests).toEqual({ normal: 1, ttml: 1 });
  await page.reload();
  await expect(page.getByText("TTML 歌词", { exact: true })).toBeVisible();
  expect(requests).toEqual({ normal: 1, ttml: 1 });

  await openLyricSettings(page);
  const duration = page.getByRole("spinbutton", { name: "歌词缓存有效期（天）" });
  await expect(duration).toHaveValue("7");
  await duration.fill("0.5");
  await duration.press("Enter");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("siteSettings")!).lyricCacheDays)).toBe(0.5);
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage).filter((key) => key.startsWith("met:lyric-cache:"))) {
      const entry = JSON.parse(localStorage.getItem(key)!);
      entry.cachedAt = Date.now() - 86_400_000;
      localStorage.setItem(key, JSON.stringify(entry));
    }
  });
  await page.reload();
  await expect(page.getByText("TTML 歌词", { exact: true })).toBeVisible();
  expect(requests).toEqual({ normal: 2, ttml: 2 });
  await openLyricSettings(page);
  await expect(duration).toHaveValue("0.5");
  const mode = page.getByText("歌词缓存", { exact: true }).locator("../../..").getByRole("combobox");
  await mode.click();
  await page.getByRole("option", { name: "永不过期", exact: true }).click();
  await expect(duration).toHaveCount(0);
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage).filter((key) => key.startsWith("met:lyric-cache:"))) {
      const entry = JSON.parse(localStorage.getItem(key)!);
      entry.cachedAt = 1;
      localStorage.setItem(key, JSON.stringify(entry));
    }
  });
  await page.reload();
  await expect(page.getByText("TTML 歌词", { exact: true })).toBeVisible();
  expect(requests).toEqual({ normal: 2, ttml: 2 });
  await openLyricSettings(page);
  await expect(mode).toContainText("永不过期");
  await mode.click();
  await page.getByRole("option", { name: "不缓存", exact: true }).click();
  for (let index = 0; index < 2; index++) {
    await page.reload();
    await expect(page.getByText("TTML 歌词", { exact: true })).toBeVisible();
    expect(requests).toEqual({ normal: 3 + index, ttml: 3 + index });
  }
});
