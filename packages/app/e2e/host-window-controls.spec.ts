import { expect, test, type Page } from "@playwright/test";

/**
 * 桌面宿主(Electron)窗口控制与拖拽区。
 *
 * 主窗是 frame: false 的无边框窗口,窗口按钮与拖拽区都得由远端 UI 提供。
 * 这里按 MeT-Music_App 的 did-finish-load 注入脚本原样模拟宿主注册,
 * 验证 UI 侧的契约实现;宿主侧代码由该仓自己的 typecheck/build 覆盖。
 *
 * 降级是重点:UI 从远端加载,会先于用户安装的 App 更新,所以装着旧版桌面端的
 * 用户拿到的是「只注册了 v2 两个回调」的组合,此时不能冒出点不动的窗口按钮。
 */

/** 按宿主注入脚本的形状注册;omit 里的回调不注册,用来模拟旧版桌面端 */
const registerHost = (page: Page, omit: string[] = []) =>
  page.evaluate((skip) => {
    const calls: string[] = [];
    (window as unknown as { __hostCalls: string[] }).__hostCalls = calls;
    const all: Record<string, () => void> = {
      onOpenSettings: () => calls.push("openSettings"),
      onHideWindow: () => calls.push("hideWindow"),
      onMinimizeWindow: () => calls.push("minimize"),
      onToggleMaximize: () => calls.push("toggleMaximize"),
      onCloseWindow: () => calls.push("close"),
    };
    const cb: Record<string, () => void> = {};
    for (const k of Object.keys(all)) if (!skip.includes(k)) cb[k] = all[k];
    (
      window as unknown as { $MeTMusic_registerHost: (c: unknown) => void }
    ).$MeTMusic_registerHost(cb);
  }, omit);

const hostCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __hostCalls: string[] }).__hostCalls);

test.use({ viewport: { width: 1280, height: 800 } });

test("宿主内:顶栏是拖拽区,内部可点元素都标了 no-drag", async ({ page }) => {
  await page.goto("/app/#/");
  await registerHost(page);

  const regions = await page.evaluate(() => {
    const header = document.querySelector("header")!;
    const read = (el: Element) =>
      getComputedStyle(el).getPropertyValue("-webkit-app-region").trim();
    return {
      header: read(header),
      // 顶栏里所有可点元素(按钮 / 链接 / 输入框)都必须落在某个 no-drag 容器内
      interactiveWithoutNoDrag: Array.from(
        header.querySelectorAll("button, a, input"),
      ).filter((el) => !el.closest(".met-no-drag")).length,
      noDragContainers: header.querySelectorAll(".met-no-drag").length,
    };
  });
  console.log("拖拽区:", regions);
  expect(regions.header).toBe("drag");
  expect(regions.noDragContainers).toBeGreaterThan(3);
  expect(regions.interactiveWithoutNoDrag).toBe(0);
});

test("宿主内:全屏播放器的封面是拖拽区(全屏层盖住顶栏后仍能拖窗口)", async ({ page }) => {
  await page.goto("/app/#/");
  await registerHost(page);
  await page.evaluate(() =>
    (
      window as unknown as {
        __debugStores: { status: { setState: (p: Record<string, unknown>) => void } };
      }
    ).__debugStores.status.setState({ showFullPlayer: true }),
  );
  await page.waitForTimeout(700);

  const state = await page.evaluate(() => {
    const cover = document.querySelector<HTMLElement>(".met-drag.aspect-square");
    const full = document.querySelector<HTMLElement>(".fixed.inset-0.z-40");
    const header = document.querySelector<HTMLElement>("header");
    const read = (el: Element | null) =>
      el ? getComputedStyle(el).getPropertyValue("-webkit-app-region").trim() : null;
    return {
      cover: read(cover),
      // 封面里不该有可点元素(拖拽区内一切都不再接收鼠标事件)
      clickableInsideCover: cover
        ? cover.querySelectorAll("button, a, input").length
        : -1,
      // 全屏层确实盖住了顶栏,顶栏的拖拽区此时够不着
      fullPlayerCoversHeader:
        !!full && !!header && full.getBoundingClientRect().top <= header.getBoundingClientRect().top,
    };
  });
  console.log("全屏播放器封面:", state);
  expect(state.cover).toBe("drag");
  expect(state.clickableInsideCover).toBe(0);
  expect(state.fullPlayerCoversHeader).toBe(true);
});

test("宿主内:最小化 / 最大化 / 关闭按钮可用,状态回推能翻转图标", async ({ page }) => {
  await page.goto("/app/#/");
  await registerHost(page);

  await page.getByRole("button", { name: "最小化" }).click();
  await page.getByRole("button", { name: "最大化" }).click();
  await page.getByRole("button", { name: "关闭" }).click();
  expect(await hostCalls(page)).toEqual(["minimize", "toggleMaximize", "close"]);

  // 宿主回推最大化状态 → 按钮变「还原」
  await page.evaluate(() =>
    (
      window as unknown as {
        $MeTMusic_setWindowState: (s: { maximized: boolean }) => void;
      }
    ).$MeTMusic_setWindowState({ maximized: true }),
  );
  await expect(page.getByRole("button", { name: "还原" })).toBeVisible();
  await expect(page.getByRole("button", { name: "最大化" })).toHaveCount(0);
});

test("旧版桌面端(只注册 v2 两个回调):退回原来的「隐藏」按钮,不出现点不动的窗口按钮", async ({
  page,
}) => {
  await page.goto("/app/#/");
  await registerHost(page, ["onMinimizeWindow", "onToggleMaximize", "onCloseWindow"]);

  await expect(page.getByRole("button", { name: "最小化" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "最大化" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "关闭" })).toHaveCount(0);
  await page.getByRole("button", { name: "隐藏" }).click();
  expect(await hostCalls(page)).toEqual(["hideWindow"]);

  // 拖拽区与宿主环境无关,旧版桌面端一样能拖
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.querySelector("header")!)
        .getPropertyValue("-webkit-app-region")
        .trim(),
    ),
  ).toBe("drag");
});

test("浏览器内(未注册宿主):不渲染任何宿主按钮", async ({ page }) => {
  await page.goto("/app/#/");
  // 只看顶栏:侧栏也有个「设置」按钮,那是应用内设置,与宿主无关
  const header = page.locator("header");
  for (const name of ["最小化", "最大化", "关闭", "隐藏", "设置"]) {
    await expect(header.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
});
