import { expect, test } from "@playwright/test";
import { seedPlayback, type DebugWindow } from "./seed";

for (const layout of [
  { width: 1200, height: 800, mode: "both" },
  { width: 1200, height: 800, mode: "only" },
  { width: 390, height: 844, mode: "only" },
] as const) {
  test(`长音首字不被裁切：${layout.width}px / ${layout.mode}`, async ({ page }) => {
    await page.setViewportSize(layout);
    await seedPlayback(page);
    await page.route("http://localhost:3000/api/**", route => route.fulfill({ json: {
      code: 200, source: "network", lrc: "", lrctrans: "", qrc: "", qrctrans: "", qrcroma: "",
    } }));
    await page.goto("/app/#/");
    await page.waitForFunction(() => Boolean((window as unknown as DebugWindow).__debugStores));
    await page.waitForFunction(() =>
      (window as unknown as DebugWindow).__debugStores!.music.getState().playSongLyricStatus === "ready");
    await page.evaluate(mode => {
      const { music, status, settings } = (window as unknown as DebugWindow).__debugStores!;
      settings.setState({ useAMLyrics: true, useAMttmlDB: false, playerBackgroundType: "gradient" });
      const lines = Array.from({ length: 5 }, (_, i) => ({
        startTime: i * 10000, endTime: (i + 1) * 10000,
        words: [
          { startTime: i * 10000, endTime: i * 10000 + 8000, word: "GA-GA-GA-GA-GA-" },
          { startTime: i * 10000 + 8000, endTime: (i + 1) * 10000, word: "GODS" },
        ],
        translatedLyric: "长阶登神", romanLyric: "", isBG: false, isDuet: false,
      }));
      music.setState({ playSongLyric: {
        hasLrcTran: true, hasLrcRoma: false, hasYrc: true, hasYrcTran: true, hasYrcRoma: false,
        lrc: [], yrc: [], lrcAM: lines, yrcAM: lines, ttml: [],
      } });
      status.setState({ showFullPlayer: true, lyricViewMode: mode,
        playState: false, playBuffering: false, playSeekMs: 15000 });
    }, layout.mode);
    await expect(page.locator(".amll-lyric-player")).toBeVisible();
    if (layout.width < 768) await page.getByRole("button", { name: "歌词页", exact: true }).click();
    // 真实强调动画停在长音展开阶段，以文字 Range 测量字形位置，
    // 检查所有祖先的实际裁切边界，避免只断言某一条 CSS 声明。
    await expect.poll(() => page.evaluate(() => {
      const animation = document.getAnimations().find(a => a.id === "emphasize-word-G-0" &&
        Number(a.currentTime) === 5000);
      const char = (animation?.effect as KeyframeEffect | undefined)?.target;
      if (!(char instanceof HTMLElement) || !char.firstChild) return null;
      const range = document.createRange();
      range.selectNodeContents(char);
      const glyph = range.getBoundingClientRect();
      let clearance = Infinity;
      for (let parent = char.parentElement; parent; parent = parent.parentElement) {
        const css = getComputedStyle(parent);
        const clips = /hidden|clip|scroll|auto/.test(css.overflowX) ||
          /paint|strict|content/.test(css.contain) || css.contentVisibility === "auto";
        if (clips) {
          const bounds = parent.getBoundingClientRect();
          clearance = Math.min(clearance, glyph.left - bounds.left, bounds.right - glyph.right);
        }
      }
      return clearance;
    })).toBeGreaterThanOrEqual(-1);
  });
}
