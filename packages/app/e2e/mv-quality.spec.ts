import { expect, test } from "@playwright/test";

for (const qualities of [[480, 720, 240], [720, 2160, 1080]]) {
  const highest = Math.max(...qualities);
  test(`网易云 MV 只请求并选中最高画质 ${highest}p`, async ({ page }) => {
    const requested: number[] = [];
    await page.addInitScript(() => {
      localStorage.setItem("plyr", JSON.stringify({ quality: 240 }));
    });
    await page.route("**/api/**", (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname.endsWith("/mv/detail")) {
        return route.fulfill({ json: {
          code: 200,
          data: {
            id: 6, name: "最高画质测试", cover: null, duration: 180000, playCount: 1,
            brs: qualities.map((br) => ({ br, size: 100, point: 0 })),
          },
        } });
      }
      if (url.pathname.endsWith("/mv/url")) {
        expect(url.searchParams.get("platform")).toBe("netease");
        const r = Number(url.searchParams.get("r"));
        requested.push(r);
        return route.fulfill({ json: {
          code: 200, data: { id: 6, r, url: `https://example.test/mv-${r}.mp4` },
        } });
      }
      return route.fulfill({ status: 404, json: { detail: "Offline test" } });
    });
    // No real video or upstream account is needed to verify source selection.
    await page.route("https://example.test/**", (route) => route.abort());
    await page.goto("/app/#/videos-player?id=6&platform=netease");
    await expect(page.locator("video source")).toHaveCount(1);
    await expect(page.locator("video source")).toHaveAttribute("size", String(highest));
    await expect(page.locator("video source")).toHaveAttribute("src", `https://example.test/mv-${highest}.mp4`);
    await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.getAttribute("src")))
      .toBe(`https://example.test/mv-${highest}.mp4`);
    expect(requested).toEqual([highest]);
  });
}
