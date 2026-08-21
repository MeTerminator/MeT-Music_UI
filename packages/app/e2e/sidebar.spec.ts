import { expect, test } from "@playwright/test";

/**
 * 桌面左侧栏展开/收起。
 * 收起 = 窄栏(纵向图标,64px),展开 = 与窄屏抽屉同一形态(整行图标 + 文字,256px)。
 * 状态持久化在 status.asideMenuExpanded。
 */
test.use({ viewport: { width: 1440, height: 900 } });

test("侧栏可展开为完整菜单,宽度有过渡且状态持久化", async ({ page }) => {
  await page.goto("/app/#/");
  const aside = page.locator("aside").first();
  await expect(aside).toBeVisible();
  expect((await aside.boundingBox())!.width).toBe(64);

  await page.getByRole("button", { name: "展开菜单" }).click();
  // 过渡中:宽度已在变但还没到位
  await page.waitForTimeout(80);
  const mid = (await aside.boundingBox())!.width;
  expect(mid).toBeGreaterThan(64);
  await page.waitForTimeout(600);
  expect((await aside.boundingBox())!.width).toBe(256);
  console.log("过渡中宽度 =", Math.round(mid));

  // 展开后与窄屏抽屉同形态:导航项是整行图标 + 文字
  await expect(aside.getByRole("link", { name: "最近播放" })).toBeVisible();

  await page.getByRole("button", { name: "收起菜单" }).click();
  await page.waitForTimeout(600);
  expect((await aside.boundingBox())!.width).toBe(64);

  // 持久化:展开后刷新仍是展开态
  await page.getByRole("button", { name: "展开菜单" }).click();
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByRole("button", { name: "收起菜单" })).toBeVisible();
  expect((await page.locator("aside").first().boundingBox())!.width).toBe(256);
});
