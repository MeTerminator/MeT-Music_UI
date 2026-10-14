import { expect, test } from "@playwright/test";
import { seedPlayback, type DebugWindow } from "./seed";

for (const ttml of [false, true]) {
  test(`${ttml ? "TTML 源时间倒置" : "逐字短句减去切行偏移"}仍可显示歌词`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await seedPlayback(page);
    await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
    await page.goto("/app/#/history");
    await page.waitForFunction(() => !!(window as unknown as DebugWindow).__debugStores);
    await page.evaluate((hasTtml) => {
      const stores = (window as unknown as DebugWindow).__debugStores!;
      const lines = Array.from({ length: 6 }, (_, i) => {
        const startTime = i === 0 ? 1263 : 5000 + i * 1000;
        return { startTime, endTime: hasTtml && i === 0 ? 1246 : startTime + 233,
          isBG: false, isDuet: false, translatedLyric: "", romanLyric: "",
          words: [{ startTime, endTime: startTime + 233, word: `短句范围测试 ${i}`, romanWord: "", obscene: false }],
        };
      });
      stores.music.setState({ playSongLyric: {
        hasTtml, hasYrc: !hasTtml, hasLrcTran: false, hasLrcRoma: false,
        lrc: lines.map((line, i) => ({ time: line.startTime / 1000, content: `短句范围测试 ${i}` })),
        lrcAM: lines, yrc: [], yrcAM: hasTtml ? [] : lines, ttml: hasTtml ? lines : [],
      } });
      stores.status.setState({ showFullPlayer: true, playState: false, playSeekMs: 1300, lyricViewMode: "only" });
    }, ttml);
    await expect(page.locator(".amll-lyric-player")).toBeVisible();
    await expect(page.getByText("短句范围测试 0", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
