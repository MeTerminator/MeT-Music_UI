import { expect, test } from "@playwright/test";
import { seedPlayback } from "./seed";

test("窄屏搜索图标打开页面，热搜和补全在页面内展示", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPlayback(page);
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/search/hot/detail")) {
      await route.fulfill({ json: { code: 200, message: "", data: [{ searchWord: "测试热搜", score: 1, content: null, source: 0, iconType: 0, iconUrl: null, url: "", alg: "" }] } });
    } else if (url.pathname.endsWith("/search/suggest")) {
      await route.fulfill({ json: { code: 200, result: { order: ["songs"], songs: [{ id: "test-song", name: "测试补全", mid: null, relname: null, artists: [], album: {}, status: 0 }] } } });
    } else await route.abort();
  });
  await page.goto("/app/#/history");
  await page.getByRole("link", { name: "打开搜索页" }).click();
  await expect(page).toHaveURL(/#\/search(?:\?|$)/);
  await expect(page.locator("main").getByText("测试热搜", { exact: true })).toHaveCount(2);
  const input = page.locator("main").getByRole("combobox", { name: "搜索" });
  await input.fill("测试");
  await expect(page.locator("main").getByText("测试补全", { exact: true })).toHaveCount(2);
  await expect(page.locator("main").getByRole("listbox")).toHaveCSS("position", "static");
  await input.press("Enter");
  await expect(page).toHaveURL(/#\/search\/songs\?.*keywords=/);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("header").getByRole("combobox", { name: "搜索" })).toBeVisible();
});

test("播放器背景流速在设置中可修改并保存", async ({ page }) => {
  await page.route(/^https?:\/\/[^/]+\/api\//, route => route.abort());
  await page.goto("/app/#/setting");
  const slider = page.getByRole("slider", { name: "全屏播放器背景流动速度" });
  await slider.scrollIntoViewIfNeeded();
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "2");
  await page.reload();
  await expect(page.getByRole("slider", { name: "全屏播放器背景流动速度" })).toHaveAttribute("aria-valuenow", "2");
});

test("桌面窗口窄屏时隐藏标题并在空间充足时恢复", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/[^/]+\/api\//, route => route.abort());
  await page.goto("/app/#/history");
  await page.evaluate(() => {
    const register = (window as unknown as { $MeTMusic_registerHost: (callbacks: Record<string, () => void>) => void }).$MeTMusic_registerHost;
    register({ onOpenSettings() {}, onHideWindow() {}, onMinimizeWindow() {}, onToggleMaximize() {}, onCloseWindow() {} });
  });
  const brand = page.locator("header").getByRole("link", { name: "MeT Music 首页" });
  await expect(brand.locator("span")).toHaveAttribute("aria-hidden", "true");
  await expect(brand).toBeVisible();
  expect(await page.locator("header").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(brand.locator("span")).toHaveAttribute("aria-hidden", "false");
});
