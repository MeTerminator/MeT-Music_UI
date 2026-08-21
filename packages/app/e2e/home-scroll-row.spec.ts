import { test, expect, type Page } from "@playwright/test";
const OUT = "/private/tmp/claude-501/-Users-meterminator-Data-AAA-Projects-MeT-Music-UI/0c6f9e49-fb72-498f-9293-f3bdfddd8cba/scratchpad";

const makeLists = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: 1000 + i, name: `我的歌单 ${i + 1}`, coverImgUrl: "" }));

/**
 * 登录态种子。首页挂载时会用 /user/playlist 刷新歌单,
 * 故 localStorage 与接口必须给同一份数据,否则种子会被顶掉。
 */
const seed = async (page: Page, count: number): Promise<void> => {
  const lists = makeLists(count);
  await page.route("**/api/web/user/playlist**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ playlist: lists }) }),
  );
  await page.addInitScript((pls) => {
    localStorage.setItem(
      "siteData",
      JSON.stringify({
        searchHistory: [],
        userLoginStatus: true,
        userData: { userId: 1, detail: {} },
        userLikeData: { playlists: pls },
        dailySongsData: { timestamp: null, data: [] },
        plCatList: { allCat: [], catList: [], hqCatList: [] },
      }),
    );
  }, lists);
};

test("我的歌单下方滚动条:可见、可拖动", async ({ page }) => {
  await seed(page, 14);
  await page.goto("/app/#/");
  const bar = page.locator('[role="scrollbar"][aria-label="我的歌单横向滚动"]');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("aria-valuenow", "0");
  await page.screenshot({ path: `${OUT}/scrollrow.png` });

  // 拖动滑块 → 行确实横向滚动了
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const valueNow = Number(await bar.getAttribute("aria-valuenow"));
  console.log("aria-valuenow after drag =", valueNow);
  expect(valueNow).toBeGreaterThan(30);
  await page.screenshot({ path: `${OUT}/scrollrow-dragged.png` });

  // 点击轨道左端 → 回到开头
  const box2 = (await bar.boundingBox())!;
  await page.mouse.click(box2.x + 2, box2.y + box2.height / 2);
  await page.waitForTimeout(800);
  const back = Number(await bar.getAttribute("aria-valuenow"));
  console.log("aria-valuenow after track click =", back);
  expect(back).toBeLessThan(10);
});

test("歌单不足以滚动时不显示滚动条", async ({ page }) => {
  await seed(page, 2);
  await page.goto("/app/#/");
  await expect(page.getByText("我的歌单 1")).toBeVisible();
  await expect(page.locator('[role="scrollbar"][aria-label="我的歌单横向滚动"]')).toHaveCount(0);
});
