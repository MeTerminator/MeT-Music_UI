import { expect, test, type Page } from "@playwright/test";

const qqUrl = "/app/#/playlist?id=1&platform=qq";
const neteaseUrl = "/app/#/playlist?id=1&platform=netease";

async function mockPlaylist(page: Page) {
  await page.route("**/api/web/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/playlist/detail")) {
      return route.fulfill({ json: { code: 200, playlist: {
        id: 1, name: "音质歌单", coverImgUrl: null, trackCount: 4,
      } } });
    }
    if (url.pathname.endsWith("/playlist/track/all")) {
      expect(url.searchParams.get("audio_api")).toBe("2");
      const netease = url.searchParams.get("platform") === "netease";
      const qualities = netease
        ? [["standard", "lossless", "hires", "jyeffect", "dolby"], ["standard", "hires", "jyeffect"], undefined, ["standard", "higher"]]
        : [["WEB", "HQ", "SQ", "RS", "DA448", "DTSX"], ["WEB", "OGG320"], undefined, ["WEB", "DTSX", "RA360"]];
      return route.fulfill({ json: {
        code: 200,
        songs: ["多音质歌曲", "另一首歌", "旧接口歌曲", "基础音质歌曲"].map((name, index) => ({
          id: index + 1, name, ar: [], al: {}, dt: 180000, fee: 1, mv: null, ttml: 0,
          available_qualities: qualities[index],
        })),
      } });
    }
    return route.fulfill({ status: 404 });
  });
}

test("QQ 与网易云各显示一个最高优先级标签，位于 VIP 前", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPlaylist(page);
  const rows = page.locator("main ul > li");
  for (const [url, secondTag, fourthTag] of [
    [qqUrl, "HQ", "360RA"],
    [neteaseUrl, "高清臻音", "较高"],
  ]) {
    await page.goto(url);
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText(/杜比\s*VIP/);
    await expect(rows.nth(0).getByText("Hi-Res", { exact: true })).toHaveCount(0);
    await expect(rows.nth(1)).toContainText(new RegExp(`${secondTag}\\s*VIP`));
    await expect(rows.nth(2)).toContainText("旧接口歌曲VIP");
    await expect(rows.nth(3)).toContainText(new RegExp(`${fourthTag}\\s*VIP`));
  }
});

for (const version of [0, 1, 2]) {
  test(`从第 ${version} 版默认配置升级，并保留之后的手动设置`, async ({ page }) => {
    await page.addInitScript((version) => {
      if (localStorage.getItem("siteSettings")) return;
      const qq = version === 0
        ? ["dolby", "hires", "sq", "hq", "standard", "master", "surround", "dtsx", "dts", "ra360", "nac"]
        : ["dolby", "ra360", "dtsx", "master", "surround", "hires", "dts", "sq", "hq", "nac", "standard"];
      const neteaseOrders = [
        ["dolby", "jyeffect", "hires", "sq", "hq", "standard", "higher", "master", "vivid", "sky"],
        ["sky", "master", "vivid", "jyeffect", "hires", "sq", "hq", "higher", "standard", "dolby"],
        ["dolby", "sky", "master", "vivid", "jyeffect", "hires", "sq", "hq", "higher", "standard"],
      ];
      const qqEnabled = ["dolby", "hires", "sq", "hq", "standard"];
      const neteaseEnabled = ["dolby", "jyeffect", "hires", "sq", "hq", "standard"];
      if (version > 0) neteaseEnabled.push("higher");
      if (version === 2) qqEnabled.push("ra360", "dtsx");
      localStorage.setItem("siteSettings", JSON.stringify({
        qualityTagsDefaultsVersion: version || undefined,
        qualityTags: {
          qq: qq.map((id) => ({ id, enabled: qqEnabled.includes(id) })),
          netease: neteaseOrders[version].map((id) => ({ id, enabled: neteaseEnabled.includes(id) })),
        },
      }));
    }, version);
    await mockPlaylist(page);
    await page.goto("/app/#/setting");
    await page.getByRole("navigation", { name: "设置分类" }).getByRole("button", { name: "播放", exact: true }).click();
    const qq = page.getByRole("list", { name: "QQ 音乐音质标签优先级" });
    for (const name of ["DTS:X", "360RA", "DTS"]) {
      await expect(qq.getByRole("checkbox", { name, exact: true })).toBeChecked();
    }
    await expect(qq.locator("label")).toHaveText([
      "杜比", "360RA", "DTS:X", "臻品母带", "臻品全景声", "Hi-Res", "DTS", "SQ", "HQ", "NAC", "标准",
    ]);
    const moveHiRes = qq.getByRole("button", { name: "上移 Hi-Res" });
    for (let step = 0; step < 5; step += 1) await moveHiRes.click();
    await expect(qq.getByRole("listitem").first()).toContainText("Hi-Res");
    await qq.getByRole("checkbox", { name: "HQ", exact: true }).uncheck();

    await page.getByRole("group", { name: "音质标签平台" }).getByRole("button", { name: "网易云音乐" }).click();
    const netease = page.getByRole("list", { name: "网易云音乐音质标签优先级" });
    await expect(netease.locator("label")).toHaveText([
      "杜比", "沉浸环绕声", "超清母带", "臻音全景声", "高清臻音", "Hi-Res", "SQ", "HQ", "较高", "标准",
    ]);
    await expect(netease.getByRole("checkbox", { name: "较高", exact: true })).toBeChecked();
    await expect(netease.getByRole("checkbox", { name: "HQ", exact: true })).toBeChecked();

    await page.goto(qqUrl);
    await page.reload();
    const rows = page.locator("main ul > li");
    await expect(rows.nth(0)).toContainText(/Hi-Res\s*VIP/);
    await expect(rows.nth(1)).toContainText(/标准\s*VIP/);
    await page.goto(neteaseUrl);
    await expect(rows.nth(0)).toContainText(/杜比\s*VIP/);
  });
}
