import { test, expect } from "@playwright/test";

test("按平台添加歌单、去重并持久化", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("siteData")) localStorage.setItem("siteData", JSON.stringify({
      userLoginStatus: true, userData: { userId: null, detail: { profile: { nickname: "QQ用户" } } },
      userLikeData: { playlists: [{ id: "1", name: "喜欢", coverImgUrl: "" }] },
      neteaseAccount: { loggedIn: true, userId: null, detail: { profile: { nickname: "网易用户" } }, playlists: [{ id: "2", name: "喜欢", coverImgUrl: "" }] },
    }));
    localStorage.setItem("siteStatus", JSON.stringify({ asideMenuExpanded: true }));
  });
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.endsWith("/playlist/detail")) return route.fulfill({ json: { code: 200, playlist: {
      id: url.searchParams.get("id"), name: `${url.searchParams.get("platform")}外部歌单`, coverImgUrl: "", trackCount: 0,
    } } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/app/#/");
  const sidebar = page.locator("aside");
  for (const [platform, name] of [["qq", "QQ 音乐"], ["netease", "网易云音乐"]]) {
    await sidebar.getByRole("button", { name: `添加${name}歌单`, exact: true }).click();
    await page.getByRole("textbox", { name: "歌单 ID" }).fill("12345");
    await page.getByRole("dialog").getByRole("button", { name: "添加", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: `${platform}外部歌单`, exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(sidebar.getByRole("button", { name: "qq外部歌单", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "netease外部歌单", exact: true })).toBeVisible();
  await sidebar.getByRole("button", { name: "添加QQ 音乐歌单", exact: true }).click();
  await page.getByRole("textbox", { name: "歌单 ID" }).fill("12345");
  await page.getByRole("dialog").getByRole("button", { name: "添加", exact: true }).click();
  await expect(page.getByText("该歌单已在列表中", { exact: true })).toBeVisible();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem("siteData")!));
  expect(data.addedPlaylists.qq).toHaveLength(1);
  expect(data.addedPlaylists.netease).toHaveLength(1);
  await page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).click();
  await sidebar.getByRole("button", { name: "qq外部歌单", exact: true }).click();
  await expect(page).toHaveURL(/platform=qq/);
  await expect(page).toHaveURL(/id=12345/);
});
