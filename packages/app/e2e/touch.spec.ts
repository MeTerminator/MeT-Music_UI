import { expect, test, type Page } from "@playwright/test";
import { seedPlayback, type DebugWindow } from "./seed";

/**
 * 触屏适配回归。
 *
 * Tailwind v4 把 hover: / group-hover: 全部包进 @media (hover: hover),
 * 触屏设备上这些规则永不生效 —— 「hover 才浮现」的行内操作按钮在触屏上
 * 是永久不可见的;歌曲行的「双击播放」在触屏上也没有对应手势。
 * 于是手机/平板上出现「列表里点不出播放」。
 *
 * 判定用 (pointer: coarse)(设备能力)而不是宽度断点:平板横屏宽度 >= 768px
 * 但同样只有触屏。CSS 侧是 styles.css 的 coarse: 变体,JS 侧是 useIsTouch()。
 *
 * 用例覆盖三类设备:手机(coarse + 窄)、鼠标(fine + 宽,行为须保持不变)、
 * 平板(coarse + 宽,最容易被漏掉的一档)。
 */

const playingName = (page: Page) =>
  page.evaluate(
    () =>
      (
        (window as unknown as DebugWindow).__debugStores!.music.getState() as unknown as {
          playSongData: { name?: string };
        }
      ).playSongData?.name ?? "",
  );

test.describe("触屏(pointer: coarse)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("媒体查询确实命中 coarse", async ({ page }) => {
    await page.goto("/app/#/");
    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    const canHover = await page.evaluate(() => matchMedia("(hover: hover)").matches);
    console.log("pointer:coarse =", coarse, " hover:hover =", canHover);
    expect(coarse).toBe(true);
  });

  test("歌单列表:单击(tap)歌曲行即播放", async ({ page }) => {
    test.skip(!!process.env.E2E_OFFLINE, "依赖真实搜索接口");
    await seedPlayback(page);
    await page.goto("/app/#/search/songs?keywords=周杰伦");
    const rows = page.locator("ul > li[data-playing], ul > li").filter({ hasText: /.+/ });
    await expect.poll(() => rows.count(), { timeout: 20_000 }).toBeGreaterThan(5);

    const before = await playingName(page);
    // 点歌名区域(不是任何按钮),模拟真实手指点击
    await rows.nth(2).locator("div.min-w-0").first().tap();
    await expect.poll(() => playingName(page), { timeout: 15_000 }).not.toBe(before);
    console.log("tap 后播放:", await playingName(page));
  });

  test("歌单列表:行尾「⋯」菜单可用", async ({ page }) => {
    test.skip(!!process.env.E2E_OFFLINE, "依赖真实搜索接口");
    await page.goto("/app/#/search/songs?keywords=周杰伦");
    const more = page.locator('button[aria-label$="更多操作"]');
    await expect.poll(() => more.count(), { timeout: 20_000 }).toBeGreaterThan(5);
    await more.first().tap();
    await expect(page.getByRole("menuitem").first()).toBeVisible();
  });

  test("播放列表抽屉:删除按钮在触屏下可见", async ({ page }) => {
    await seedPlayback(page);
    await page.goto("/app/#/");
    await page.waitForFunction(() => !!(window as unknown as { __debugStores?: unknown }).__debugStores);
    await page.evaluate(() => { (window as unknown as DebugWindow).$MeTMusic_next!(); });
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__debugStores!.status.setState({ playListShow: true });
    });
    const del = page.locator('button[title="从列表中移除"]').first();
    await expect(del).toBeVisible();
    const opacity = await del.evaluate((el) => getComputedStyle(el).opacity);
    console.log("删除按钮 opacity =", opacity);
    expect(Number(opacity)).toBe(1);
  });
});

test.describe("鼠标(pointer: fine)保持原交互", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("单击不播放,双击才播放;「⋯」在 md+ 隐藏", async ({ page }) => {
    test.skip(!!process.env.E2E_OFFLINE, "依赖真实搜索接口");
    await seedPlayback(page);
    await page.goto("/app/#/search/songs?keywords=周杰伦");
    const rows = page.locator("ul > li").filter({ hasText: /.+/ });
    await expect.poll(() => rows.count(), { timeout: 20_000 }).toBeGreaterThan(5);

    const before = await playingName(page);
    const target = rows.nth(2).locator("div.min-w-0").first();
    await target.click();
    await page.waitForTimeout(700);
    expect(await playingName(page)).toBe(before); // 单击不播放

    await target.dblclick();
    await expect.poll(() => playingName(page), { timeout: 15_000 }).not.toBe(before);

    // md+ 鼠标下「⋯」不占位
    const moreVisible = await page.locator('button[aria-label$="更多操作"]').first().isVisible();
    console.log("md+ 鼠标下 ⋯ 可见 =", moreVisible);
    expect(moreVisible).toBe(false);
  });
});

test.describe("触屏平板(coarse 且 >= 768px,走桌面布局)", () => {
  test.use({ viewport: { width: 1024, height: 1366 }, isMobile: true, hasTouch: true });

  test("全屏播放器控制条不会自动淡出", async ({ page }) => {
    await seedPlayback(page);
    await page.goto("/app/#/");
    await page.waitForFunction(() => !!(window as unknown as { __debugStores?: unknown }).__debugStores);
    await page.evaluate(() => { (window as unknown as DebugWindow).$MeTMusic_next!(); });
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__debugStores!.status.setState({ showFullPlayer: true });
    });
    await page.waitForTimeout(3500); // 远超原本的 2 秒自动隐藏
    const shown = await page.evaluate(
      () =>
        (
          (window as unknown as DebugWindow).__debugStores!.status.getState() as unknown as {
            playerControlShow: boolean;
          }
        ).playerControlShow,
    );
    console.log("3.5s 后 playerControlShow =", shown);
    expect(shown).toBe(true);
    // 全屏播放器在 DOM 中排在底栏播放条之后,取 last 才是它自己的播放键
    await expect(page.locator('button[title="播放"], button[title="暂停"]').last()).toBeVisible();
  });

  test("封面「播放全部」按钮在触屏下常显", async ({ page }) => {
    test.skip(!!process.env.E2E_OFFLINE, "依赖真实接口");
    await page.goto("/app/#/search/playlists?keywords=周杰伦");
    const btn = page.locator('button[aria-label="播放全部"]').first();
    await expect(btn).toBeVisible({ timeout: 20_000 });
    const opacity = await btn.evaluate((el) => getComputedStyle(el).opacity);
    console.log("封面播放键 opacity =", opacity);
    expect(Number(opacity)).toBe(1);
  });
});
