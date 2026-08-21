import { expect, test, type Page } from "@playwright/test";

/**
 * 歌曲列表的 TTML / VIP / EP / MV 标签排布。
 *
 * 手机竖屏下标签与歌名同行会把歌名挤没:实测改动前 390px 宽屏上
 * 「晴天」的可见宽度只有 16px(一个字都放不全)。故窄屏把标签折到歌名下一行,
 * md+ 用 display:contents 让标签容器透明,保持原来的单行布局不变。
 */

/** 首行的歌名宽度,以及首个标签是否落在歌名下方 */
const measure = async (page: Page) => {
  await page.goto("/app/#/search/songs?keywords=周杰伦");
  await page.locator("ul > li").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("ul > li")).slice(0, 4);
    return rows
      .map((r) => {
        const head = r.querySelector<HTMLElement>("div.min-w-0.flex-1")
          ?.firstElementChild as HTMLElement | null;
        const nameEl = head?.firstElementChild as HTMLElement | null;
        const tag = head?.querySelector<HTMLElement>("span,button");
        if (!nameEl || !tag) return null;
        const n = nameEl.getBoundingClientRect();
        return {
          nameW: Math.round(n.width),
          tagBelowName: Math.round(tag.getBoundingClientRect().top - n.bottom) >= -1,
        };
      })
      .filter(Boolean) as { nameW: number; tagBelowName: boolean }[];
  });
};

test.describe("手机竖屏", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("标签折到歌名下一行,歌名独占整列宽度", async ({ page }) => {
    test.skip(!!process.env.E2E_OFFLINE, "依赖真实搜索接口");
    const rows = await measure(page);
    console.log("手机竖屏:", rows);
    expect(rows.length).toBeGreaterThan(2);
    for (const r of rows) {
      expect(r.tagBelowName).toBe(true);
      // 独占整列:同一列里所有歌名等宽,且远宽于改动前被标签挤剩的十几 px
      expect(r.nameW).toBeGreaterThan(100);
    }
    expect(new Set(rows.map((r) => r.nameW)).size).toBe(1);
  });
});

test.describe("桌面宽屏", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("保持标签与歌名同行(md+ 布局不变)", async ({ page }) => {
    test.skip(!!process.env.E2E_OFFLINE, "依赖真实搜索接口");
    const rows = await measure(page);
    console.log("桌面宽屏:", rows);
    expect(rows.length).toBeGreaterThan(2);
    for (const r of rows) expect(r.tagBelowName).toBe(false);
    // 同行时歌名按内容宽度收缩,不会被拉成等宽的一整列
    expect(new Set(rows.map((r) => r.nameW)).size).toBeGreaterThan(1);
  });
});
