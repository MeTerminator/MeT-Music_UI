import { expect, test } from "@playwright/test";
import { seedPlayback } from "./seed";

for (const mobile of [false, true]) {
  test(`歌曲信息淡入淡出、封面圆形覆盖，歌词立即清空（${mobile ? "手机" : "桌面"}）`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await seedPlayback(page);
    await page.route("**/lyric/**", route => route.fulfill({ json: {
      code: 200, source: "network", lrc: "", lrctrans: "", qrc: "", qrctrans: "", qrcroma: "",
    } }));
    await page.goto("/app/#/");
    await page.waitForFunction(() => Boolean((window as any).__debugStores));
    await page.evaluate(() => {
      const { music, status, settings } = (window as any).__debugStores;
      settings.setState({ useAMLyrics: false, playerBackgroundType: "gradient" });
      const covers = ["#cc5544", "#44aacc"].map(color =>
        `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${color}"/></svg>`)}`);
      const songs = music.getState().playList.map((song: any, i: number) => ({ ...song, coverSize: { l: covers[i] } }));
      music.setState({ playList: songs, playSongData: songs[0], playSongLyric: { ...music.getState().playSongLyric,
        lrc: Array.from({ length: 8 }, (_, i) => ({ time: i * 10, content: `上一首专属歌词${i}` })),
      } });
      status.setState({ showFullPlayer: true, playSongLyricIndex: 0 });
    });
    const group = page.getByTestId("song-transition");
    await expect(group).toContainText("晴天");
    await expect(page.getByText("上一首专属歌词0", { exact: true })).toBeVisible();
    // 一次同步提交切歌，保留旧节点退场，同时要求歌词当场移除。
    const during = await page.evaluate(() => {
      const { music } = (window as any).__debugStores;
      music.setState({ playSongData: music.getState().playList[1] });
      return music.getState().playSongLyric.lrc;
    });
    expect(during).toEqual([]);
    const cover = page.getByTestId("circular-cover").first();
    const reveal = cover.getByTestId("cover-reveal");
    await expect(reveal).toHaveCount(1);
    await expect.poll(() => reveal.evaluate(el => {
      const radius = Number(getComputedStyle(el).clipPath.match(/circle\(([\d.]+)%/)?.[1]);
      return radius > 0 && radius < 72;
    })).toBe(true);
    // 扩散时新旧封面同时存在；信息没有位移动画。
    await expect(cover.locator("img")).toHaveCount(2);
    const revealedImage = await reveal.locator("img").elementHandle();
    await expect(group).toHaveCSS("transform", "none");
    await expect(page.getByText("上一首专属歌词0", { exact: true })).toHaveCount(0);
    await expect(group).toContainText("稻香");
    await expect(group).not.toContainText("晴天");
    await expect(group).toHaveCSS("opacity", "1");
    await expect(reveal).toHaveCount(0);
    await expect(cover.locator("img")).toHaveCount(1);
    // 动画结束沿用已经绘制的新图，不能卸载它再给底图换 src。
    expect(await revealedImage!.evaluate(img => img.isConnected)).toBe(true);
    expect(await cover.locator("img").evaluate((img, revealed) =>
      img === revealed && img.complete && img.naturalWidth > 0, revealedImage)).toBe(true);
    // 连续切歌不会留下中间歌曲或多个退场层。
    await page.evaluate(() => {
      const { music } = (window as any).__debugStores;
      const songs = music.getState().playList;
      music.setState({ playSongData: songs[0] });
      setTimeout(() => music.setState({ playSongData: { ...songs[1], name: "最终歌曲" } }), 30);
    });
    await expect(group).toHaveCount(1);
    await expect(group).toContainText("最终歌曲");
    await expect(group).toHaveCSS("opacity", "1");
  });
}
