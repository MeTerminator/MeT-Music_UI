import { expect, test, type Page } from "@playwright/test";

async function mockPlaylist(
  page: Page,
  trackCount: number,
  platform = "qq",
  beforePage?: (offset: number) => Promise<void>,
) {
  const requests: { limit: number; offset: number }[] = [];
  await page.route("**/api/web/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/playlist/detail")) {
      return route.fulfill({ json: { code: 200, playlist: {
        id: 123, name: "分页歌单", coverImgUrl: null, trackCount,
      } } });
    }
    if (url.pathname.endsWith("/playlist/track/all")) {
      expect(url.searchParams.get("platform")).toBe(platform);
      const limit = Number(url.searchParams.get("limit"));
      const offset = Number(url.searchParams.get("offset"));
      requests.push({ limit, offset });
      await beforePage?.(offset);
      return route.fulfill({ json: {
        code: 200,
        songs: Array.from({ length: Math.max(0, Math.min(limit, trackCount - offset)) }, (_, index) => {
          const id = offset + index + 1;
          return {
            id, name: id === trackCount ? "歌单最后一首" : `歌曲 ${id}`,
            ar: [{ id: 1, name: "歌手" }], al: { id: 1, name: "专辑", picUrl: "" },
            dt: 180000, fee: 0, mv: 0, ttml: 0,
          };
        }),
      } });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto(`/app/#/playlist?id=123&platform=${platform}`);
  return requests;
}

async function visibleRows(page: Page) {
  return page.locator("main").evaluate((main) => {
    const height = main.clientHeight - parseFloat(getComputedStyle(main).paddingBottom);
    const row = main.querySelector("ul > li")!;
    return Math.floor(height / row.getBoundingClientRect().height);
  });
}

async function scrollNearMidpoint(page: Page, delta: number) {
  await page.locator("main").evaluate((main, delta) => {
    const list = main.querySelector("ul")!.getBoundingClientRect();
    const bottom = main.getBoundingClientRect().bottom - parseFloat(getComputedStyle(main).paddingBottom);
    main.scrollTop += list.top + list.height / 2 - bottom + delta;
  }, delta);
}

test("歌单按视口加载五屏，滚过中点后按新窗口高度续载", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const requests = await mockPlaylist(page, 1200);
  const rows = page.locator("main ul > li");
  await expect(rows.first()).toBeVisible();
  const firstLimit = (await visibleRows(page)) * 5;
  await expect(rows).toHaveCount(firstLimit);
  expect(requests).toEqual([{ limit: firstLimit, offset: 0 }]);

  await scrollNearMidpoint(page, -100);
  await page.waitForTimeout(150);
  expect(requests).toHaveLength(1);
  await page.setViewportSize({ width: 1280, height: 900 });
  const nextLimit = (await visibleRows(page)) * 5;
  expect(nextLimit).toBeGreaterThan(firstLimit);

  await scrollNearMidpoint(page, 100);
  await expect(rows).toHaveCount(firstLimit + nextLimit);
  expect(requests).toEqual([{ limit: firstLimit, offset: 0 }, { limit: nextLimit, offset: firstLimit }]);
  await expect(rows.nth(firstLimit)).toContainText(`歌曲 ${firstLimit + 1}`);
});

test("分页歌单搜索可以找到尚未浏览的歌曲", async ({ page }) => {
  const requests = await mockPlaylist(page, 900, "netease");
  const rows = page.locator("main ul > li");
  await expect(rows.first()).toBeVisible();
  const firstLimit = requests[0].limit;
  await page.getByPlaceholder("模糊搜索").fill("歌单最后一首");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("歌单最后一首");
  expect(requests.slice(1).map(({ offset }) => offset)).toEqual([firstLimit, firstLimit + 800]);
  await page.getByPlaceholder("模糊搜索").clear();
  await expect(rows).toHaveCount(firstLimit);
});

test("点播先播放所选歌曲，后台补齐队列并保留浏览分页", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("siteSettings", JSON.stringify({ simulationPlaying: true }));
  });
  let releaseRemaining!: () => void;
  const remaining = new Promise<void>((resolve) => { releaseRemaining = resolve; });
  const requests = await mockPlaylist(page, 900, "qq", async (offset) => {
    if (offset > 0) await remaining;
  });
  const rows = page.locator("main ul > li");
  await expect(rows.first()).toBeVisible();
  const firstLimit = requests[0].limit;
  const playback = () => page.evaluate(() => {
    const { music, status } = (window as any).__debugStores;
    return {
      song: music.getState().playSongData.name,
      playing: status.getState().playState,
      index: status.getState().playIndex,
      queueLength: music.getState().playList.length,
      last: music.getState().playList.at(-1)?.name,
    };
  });

  try {
    await rows.nth(1).getByRole("button", { name: "播放 歌曲 2", exact: true }).click();
    await expect.poll(playback).toMatchObject({
      song: "歌曲 2", playing: true, index: 1, queueLength: firstLimit,
    });
    await expect.poll(() => requests.length).toBe(2);
  } finally {
    releaseRemaining();
  }

  await expect.poll(playback).toMatchObject({
    song: "歌曲 2", playing: true, index: 1, queueLength: 900, last: "歌单最后一首",
  });
  await expect(rows).toHaveCount(firstLimit);
  expect(requests.slice(1).map(({ offset }) => offset)).toEqual([firstLimit, firstLimit + 800]);
});

test("视口能显示超过 800 行时分片加载完整歌单", async ({ page }) => {
  await page.addInitScript(() => {
    // 模拟极高的滚动容器，避免超大浏览器视口影响渲染。
    const clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight")!;
    Object.defineProperty(Element.prototype, "clientHeight", {
      ...clientHeight,
      get() {
        return this.tagName === "MAIN" ? 801 * 58 + 96 : clientHeight.get!.call(this);
      },
    });
  });
  const requests = await mockPlaylist(page, 801);
  await expect(page.locator("main ul > li")).toHaveCount(801);
  expect(requests).toEqual([{ limit: 800, offset: 0 }, { limit: 1, offset: 800 }]);
});
