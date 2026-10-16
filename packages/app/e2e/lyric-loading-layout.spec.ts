import { expect, test } from "@playwright/test";
import { seedPlayback, SEED_SONGS } from "./seed";

for (const result of ["lyrics", "empty", "error"] as const) {
  test(`歌词请求未完成时保留空白分栏，完成结果：${result}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedPlayback(page);
    let finish!: () => void;
    const held = new Promise<void>(resolve => { finish = resolve; });
    const response = (lrc = "") => ({ code: 200, source: "network", lrc,
      lrctrans: "", qrc: "", qrctrans: "", qrcroma: "" });
    await page.route("**/lyric/new?**", async route => {
      if (new URL(route.request().url()).searchParams.get("id") === SEED_SONGS[1].id) {
        await held;
        await route.fulfill({ json: result === "error" ? { invalid: true } : response(result === "lyrics"
          ? Array.from({ length: 8 }, (_, i) => `[00:${String(i + 1).padStart(2, "0")}.000]新歌曲歌词${i}`).join("\n") : "") });
      } else await route.fulfill({ json: response() });
    });
    await page.goto("/app/#/");
    await page.waitForFunction(() => Boolean((window as any).__debugStores));
    await page.evaluate(() => {
      const { music, status, settings } = (window as any).__debugStores;
      settings.setState({ useAMLyrics: false, useAMttmlDB: false, playerBackgroundType: "gradient" });
      music.setState({ playSongLyricStatus: "ready", playSongLyric: {
        ...music.getState().playSongLyric,
        lrc: Array.from({ length: 8 }, (_, i) => ({ time: i * 10, content: `旧歌曲歌词${i}` })),
      } });
      status.setState({ showFullPlayer: true, lyricViewMode: "both" });
    });
    const area = page.getByTestId("full-player-lyrics");
    await expect(area).toBeVisible();
    const before = (await area.boundingBox())!.width;
    await page.evaluate(() => (window as any).$MeTMusic_next());
    await expect(area).toHaveAttribute("aria-busy", "true");
    await expect(area).toHaveText("");
    await expect(page.getByText("旧歌曲歌词0", { exact: true })).toHaveCount(0);
    // 超过分栏动画时长后，仍必须保留原宽度。
    await page.waitForTimeout(650);
    expect((await area.boundingBox())!.width).toBeCloseTo(before, 0);
    finish();
    if (result === "empty") {
      await expect(area).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => (window as any).__debugStores.music.getState().playSongLyricStatus)).toBe("ready");
    } else {
      await expect(area).toHaveAttribute("aria-busy", "false");
      expect((await area.boundingBox())!.width).toBeCloseTo(before, 0);
      if (result === "lyrics") await expect(area).toContainText("新歌曲歌词0");
      else await expect(area).toHaveText("");
    }
  });
}
