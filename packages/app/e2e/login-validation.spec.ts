import { test, expect } from "@playwright/test";

for (const [platform, name] of [["qq", "QQ 音乐"], ["netease", "网易云音乐"]] as const) {
  test(`${name}拒绝无效用户和请求错误，允许有效空歌单用户`, async ({ page }) => {
    let mode = "missing";
    await page.route("**/api/**", route => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname.endsWith("/user/playlist")) {
        if (mode === "network") return route.abort("failed");
        if (mode === "http") return route.fulfill({ status: 404, json: { detail: "User not found" } });
        return route.fulfill({ json: {
          code: mode === "error" ? 500 : 200, version: "", more: false,
          username: mode === "valid" ? "有效用户" : mode === "blank" ? "  " : null,
          avatarUrl: null, playlist: [],
        } });
      }
      return route.fulfill({ status: 404, json: {} });
    });
    await page.goto("/app/#/");
    const entry = page.locator("aside").getByRole("button", { name: `登录${name}`, exact: true });
    await entry.click();
    await page.getByRole("textbox").fill("12345");
    const dialog = page.getByRole("dialog");
    for (const failure of ["missing", "blank", "error", "http", "network"]) {
      mode = failure;
      await dialog.getByRole("button", { name: "登录", exact: true }).click();
      await expect(dialog.getByRole("button", { name: "登录", exact: true })).toBeEnabled();
      await expect(dialog).toBeVisible();
      const data = await page.evaluate(() => JSON.parse(localStorage.getItem("siteData") ?? "{}"));
      expect(platform === "qq" ? data.userLoginStatus : data.neteaseAccount?.loggedIn).not.toBe(true);
      expect(platform === "qq" ? data.userData?.userId : data.neteaseAccount?.userId).toBeFalsy();
    }
    mode = "valid";
    await dialog.getByRole("button", { name: "登录", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem("siteData")!));
    expect(platform === "qq" ? data.userLoginStatus : data.neteaseAccount.loggedIn).toBe(true);
    expect(platform === "qq" ? data.userData.userId : data.neteaseAccount.userId).toBe("12345");
  });
}
