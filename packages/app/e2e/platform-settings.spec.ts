import { expect, test } from "@playwright/test";
import type { DebugWindow } from "./seed";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.endsWith("/search/hot/detail")) {
      const platform = url.searchParams.get("platform");
      return route.fulfill({ json: { code: 200, message: "success", data: [{
        searchWord: platform === "netease" ? "网易热词" : "QQ热词", score: 100,
        content: "测试热搜", source: 0, iconType: 0, iconUrl: null, url: "", alg: "",
      }] } });
    }
    if (url.pathname.endsWith("/cloudsearch")) {
      return route.fulfill({ json: { code: 200, result: { songs: [], songCount: 0 } } });
    }
    return route.fulfill({ status: 404, json: { detail: "Offline test" } });
  });
});

test("热搜左侧 QQ、右侧网易云，点击保留所属平台", async ({ page }) => {
  await page.goto("/app/#/");
  for (const [platform, name, word] of [["qq", "QQ 音乐", "QQ热词"], ["netease", "网易云音乐", "网易热词"]]) {
    await page.getByRole("combobox", { name: "搜索", exact: true }).click();
    const qq = page.getByRole("region", { name: "QQ 音乐热搜榜", exact: true });
    const netease = page.getByRole("region", { name: "网易云音乐热搜榜", exact: true });
    await expect(qq.getByText("QQ热词", { exact: true })).toBeVisible();
    await expect(netease.getByText("网易热词", { exact: true })).toBeVisible();
    const left = await qq.boundingBox();
    const right = await netease.boundingBox();
    expect(left!.x).toBeLessThan(right!.x);
    expect(Math.abs(left!.y - right!.y)).toBeLessThan(2);
    await page.getByRole("region", { name: `${name}热搜榜`, exact: true }).getByRole("button", { name: new RegExp(word) }).click();
    await expect(page).toHaveURL(new RegExp(`platform=${platform}`));
    expect(new URLSearchParams(page.url().split("?")[1]).get("keywords")).toBe(word);
  }
});

test("旧 QQ 设置保留，网易云音质独立选择并持久化", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("siteSettings")) localStorage.setItem("siteSettings", JSON.stringify({ songLevel: "sq" }));
  });
  await page.goto("/app/#/");
  await page.waitForFunction(() => !!(window as unknown as DebugWindow).__debugStores);
  await page.evaluate(() => (window as unknown as DebugWindow).__debugStores!.status.setState({ showSettingsPanel: true }));
  const qq = page.getByText("QQ 音乐音质选择", { exact: true }).locator("../..");
  const netease = page.getByText("网易云音乐音质选择", { exact: true }).locator("../..");
  await expect(qq.getByRole("combobox")).toContainText("无损 SQ");
  await expect(netease.getByRole("combobox")).toContainText("极高");
  await netease.getByRole("combobox").click();
  await expect(page.getByRole("option")).toHaveCount(10);
  await page.getByRole("option", { name: "超清母带", exact: true }).click();
  await expect(netease.getByRole("combobox")).toContainText("超清母带");
  await expect(qq.getByRole("combobox")).toContainText("无损 SQ");
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as DebugWindow).__debugStores);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("siteSettings") ?? "{}"));
  expect(stored.songLevel).toBe("sq");
  expect(stored.neteaseSongLevel).toBe("jymaster");
  await page.goto("/app/#/download?id=123&platform=netease");
  await expect(page.getByRole("combobox").filter({ hasText: "超清母带" })).toBeVisible();
});
