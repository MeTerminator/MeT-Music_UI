import { test, expect } from "@playwright/test";

/**
 * 音乐资源自动缓存:下载期间进度条顶替为下载进度显示器
 * (status.songCacheProgress >= 0 时生效)。
 */
test("缓存下载中进度条顶替为下载进度显示器", async ({ page }) => {
  await page.goto("/app/#/");
  await page.waitForFunction(() => !!(window as unknown as { __debugStores?: unknown }).__debugStores);
  await page.evaluate(() => {
    (
      window as unknown as {
        __debugStores: { status: { setState: (p: Record<string, unknown>) => void } };
      }
    ).__debugStores.status.setState({ songCacheProgress: 37 });
  });
  const bar = page.locator('[aria-label="歌曲缓存进度"]');
  await expect(bar.first()).toBeVisible();
  await expect(bar.first()).toHaveAttribute("aria-valuenow", "37");
  await expect(page.getByText("缓存中").first()).toBeVisible();
  await expect(page.getByText("37%").first()).toBeVisible();
});
