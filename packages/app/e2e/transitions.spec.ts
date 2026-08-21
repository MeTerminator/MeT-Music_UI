import { expect, test, type Page } from "@playwright/test";
import { seedPlayback, type DebugWindow } from "./seed";

/**
 * 浮层进出场过渡回归。
 *
 * 两类实现要分开验:
 * - 菜单类(DropdownMenu / ContextMenu / Select)交给 Base UI 的
 *   data-starting-style / data-ending-style,退场期间组件仍挂载,动画结束才卸载;
 * - 窄屏抽屉是自己管的:进场用 CSS animation(挂载即播,不依赖 rAF 时序),
 *   退场用 transition + -translate-x-full,transitionend 后才卸载。
 *
 * 过渡只有 150~300ms,单次取样很容易错过,故开场用 rAF 连续采样取最小值。
 */

/** 触发前挂上 rAF 采样器,收集弹层最初 300ms 的 opacity/scale(单次取样太容易错过 150ms 的过渡) */
const sampleOpening = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ opacity: number; scale: string }[]>((resolve) => {
        const out: { opacity: number; scale: string }[] = [];
        const t0 = performance.now();
        const tick = () => {
          const el = document.querySelector<HTMLElement>('[role="menu"]');
          if (el) {
            const cs = getComputedStyle(el);
            out.push({ opacity: Number(cs.opacity), scale: cs.scale });
          }
          if (performance.now() - t0 < 300) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
  );

const popupState = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[role="menu"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      opacity: Number(cs.opacity).toFixed(2),
      scale: cs.scale,
      origin: cs.transformOrigin,
      ending: el.hasAttribute("data-ending-style"),
    };
  });

test.describe("菜单弹层过渡", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("⋯ 下拉:开合都有缩放淡入淡出", async ({ page }) => {
    test.skip(!!process.env.E2E_OFFLINE, "依赖真实搜索接口");
    await seedPlayback(page);
    await page.goto("/app/#/search/songs?keywords=周杰伦");
    // md+ 鼠标下行内 ⋯ 隐藏,改用底栏播放条的「更多操作」
    await page.evaluate(() => { (window as unknown as DebugWindow).$MeTMusic_next!(); });
    const trigger = page.locator('button[aria-label="更多操作"]').first();
    await expect(trigger).toBeVisible({ timeout: 20_000 });

    const sampler = sampleOpening(page);
    await trigger.click();
    const samples = await sampler;
    const minOpacity = Math.min(...samples.map((x) => x.opacity));
    console.log("开启 300ms 内最小 opacity =", minOpacity, " 采样帧数 =", samples.length);
    expect(minOpacity).toBeLessThan(1); // 确实淡入过
    expect(samples.some((x) => x.scale !== "none" && x.scale !== "1")).toBe(true); // 也缩放过

    await page.waitForTimeout(300);
    const opened = await popupState(page);
    console.log("展开后:", opened);
    expect(Number(opened!.opacity)).toBe(1);

    // 点空白关闭:退场期间仍挂载,并带 data-ending-style
    await page.mouse.click(700, 300);
    await page.waitForTimeout(40);
    const closing = await popupState(page);
    console.log("关闭瞬间:", closing);
    expect(closing).not.toBeNull();
    expect(closing!.ending).toBe(true);
    await page.waitForTimeout(400);
    expect(await popupState(page)).toBeNull(); // 动画结束后真正卸载
  });

  test("右键菜单:以鼠标点为原点展开", async ({ page }) => {
    test.skip(!!process.env.E2E_OFFLINE, "依赖真实搜索接口");
    await page.goto("/app/#/search/songs?keywords=周杰伦");
    const row = page.locator("ul > li").filter({ hasText: /.+/ }).nth(2);
    await expect(row).toBeVisible({ timeout: 20_000 });
    const sampler = sampleOpening(page);
    await row.click({ button: "right" });
    const samples = await sampler;
    const minOpacity = Math.min(...samples.map((x) => x.opacity));
    console.log("右键开启 300ms 内最小 opacity =", minOpacity, " 采样帧数 =", samples.length);
    expect(minOpacity).toBeLessThan(1);
    await page.waitForTimeout(300);
    const opened = await popupState(page);
    console.log("右键展开后:", opened);
    expect(Number(opened!.opacity)).toBe(1);
    // --transform-origin 由 Base UI 定位层写入,不该是默认的居中
    expect(opened!.origin).not.toBe("");
  });
});

test.describe("窄屏抽屉过渡", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  const panel = (page: Page) =>
    page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".met-drawer-in");
      if (!el) return null;
      return {
        matrix: getComputedStyle(el).transform,
        x: Math.round(el.getBoundingClientRect().left),
      };
    });

  test("汉堡开抽屉:自左滑入,关闭时滑出后才卸载", async ({ page }) => {
    await page.goto("/app/#/");
    await page.getByRole("button", { name: "打开菜单" }).tap();
    await page.waitForTimeout(60);
    const mid = await panel(page);
    console.log("滑入中 left =", mid?.x);
    expect(mid).not.toBeNull();
    expect(mid!.x).toBeLessThan(0); // 还没滑到位

    await page.waitForTimeout(500);
    const open = await panel(page);
    console.log("到位 left =", open?.x);
    expect(open!.x).toBe(0);

    await page.getByRole("button", { name: "关闭菜单" }).tap();
    await page.waitForTimeout(80);
    const closing = await panel(page);
    console.log("滑出中 left =", closing?.x);
    expect(closing).not.toBeNull(); // 退场期间仍挂载
    expect(closing!.x).toBeLessThan(0);

    await page.waitForTimeout(500);
    expect(await panel(page)).toBeNull(); // 动画结束后卸载
  });
});
