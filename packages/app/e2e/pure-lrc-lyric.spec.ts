import { expect, test, type Page } from "@playwright/test";
import { seedPlayback, type DebugWindow } from "./seed";

/**
 * 纯 lrc 歌曲的歌词推进回归。
 *
 * 接口对没有逐字时间轴的歌曲(如 004VU57w4JZWAg《爱如火》)会在 qrc 字段里回落一份
 * base64 的普通 lrc,解析不出逐字行。此前 hasYrc 只看字段是否存在,于是出现
 * hasYrc=true 而 yrc/yrcAM 全空的组合:引擎在空数组上算歌词索引恒得 -1,
 * 整首歌不高亮、不滚动、底栏也没有歌词。
 *
 * 修正分两层,两层各一个用例:
 * 1. lyrics/parse.ts:hasYrc 改为以实际解析出的逐字行为准(→ 走 AMLL);
 * 2. player/engine.ts:算索引时额外要求 yrc 非空,兜住历史持久化下来的坏组合。
 */

const LRC = Array.from({ length: 12 }, (_, i) => ({ time: i * 6, content: `第 ${i + 1} 行歌词` }));
const LRC_AM = LRC.map((l, i) => ({
  words: [{ startTime: l.time * 1000, endTime: (LRC[i + 1]?.time ?? l.time + 6) * 1000, word: l.content, romanWord: "", obscene: false }],
  translatedLyric: "", romanLyric: "",
  startTime: l.time * 1000,
  endTime: (LRC[i + 1]?.time ?? l.time + 6) * 1000,
  isBG: false, isDuet: false,
}));

const seekTo = async (page: Page, fraction: number) => {
  const bar = page.locator('[aria-label="播放进度"]').first();
  const box = (await bar.boundingBox())!;
  await page.mouse.click(box.x + 8 + (box.width - 16) * fraction, box.y + box.height / 2);
  await page.waitForTimeout(600);
};

const lyricIndex = (page: Page) =>
  page.evaluate(() => (window as unknown as DebugWindow).__debugStores!.status.getState() as unknown as { playSongLyricIndex: number })
    .then((s) => s.playSongLyricIndex);

/** hasYrc=true 但 yrc 为空 —— 修复前的持久化数据形态 */
test("纯 lrc 歌曲(历史 hasYrc=true/yrc 空):歌词索引仍随播放推进", async ({ page }) => {
  await seedPlayback(page);
  await page.goto("/app/#/");
  await page.waitForFunction(() => !!(window as unknown as { __debugStores?: unknown }).__debugStores);
  await page.evaluate(() => { (window as unknown as DebugWindow).$MeTMusic_next!(); });
  await page.waitForTimeout(600);
  await page.evaluate(({ lrc, lrcAM }) => {
    (window as unknown as DebugWindow).__debugStores!.music.setState({
      playSongLyric: {
        hasLrcTran: false, hasLrcRoma: false, hasYrc: true, hasYrcTran: false, hasYrcRoma: false,
        lrc, yrc: [], lrcAM, yrcAM: [], ttml: [],
      },
    });
  }, { lrc: LRC, lrcAM: LRC_AM });

  await seekTo(page, 0.15); // 223s * 0.15 ≈ 33s → 第 6 行
  const idx = await lyricIndex(page);
  console.log("playSongLyricIndex =", idx);
  expect(idx).toBeGreaterThan(0);

  // 底栏歌词跟着出来了(修复前索引恒 -1,底栏只显示歌手)
  await expect(page.locator(".lyric-font").first()).toBeVisible();

  // 全屏播放器走 AMLL(hasYrc 为真但 yrcAM 为空时,FullPlayer 仍应能渲染歌词)
  await page.evaluate(() => {
    (window as unknown as DebugWindow).__debugStores!.status.setState({ showFullPlayer: true });
  });
  await page.waitForTimeout(800);
  const which = await page.evaluate(() => ({
    amll: !!document.querySelector(".amll-lyric-player"),
    scroll: !!document.querySelector("[data-lrc-index]"),
  }));
  console.log("歌词渲染方式 =", which);
  expect(which.amll || which.scroll).toBe(true);
});

/** parse 修正后的正常形态:hasYrc=false */
test("纯 lrc 歌曲(hasYrc=false):全屏播放器走 AMLL 并推进", async ({ page }) => {
  await seedPlayback(page);
  await page.goto("/app/#/");
  await page.waitForFunction(() => !!(window as unknown as { __debugStores?: unknown }).__debugStores);
  await page.evaluate(() => { (window as unknown as DebugWindow).$MeTMusic_next!(); });
  await page.waitForTimeout(600);
  await page.evaluate(({ lrc, lrcAM }) => {
    (window as unknown as DebugWindow).__debugStores!.music.setState({
      playSongLyric: {
        hasLrcTran: false, hasLrcRoma: false, hasYrc: false, hasYrcTran: false, hasYrcRoma: false,
        lrc, yrc: [], lrcAM, yrcAM: [], ttml: [],
      },
    });
  }, { lrc: LRC, lrcAM: LRC_AM });

  // 先在底栏 seek(全屏播放器打开后会盖住底栏进度条)
  await seekTo(page, 0.3);
  const idx = await lyricIndex(page);
  console.log("playSongLyricIndex =", idx);
  expect(idx).toBeGreaterThan(2);

  await page.evaluate(() => {
    (window as unknown as DebugWindow).__debugStores!.status.setState({ showFullPlayer: true });
  });
  await expect(page.locator(".amll-lyric-player")).toBeVisible();
});
