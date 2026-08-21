import { test, expect, type Page } from "@playwright/test";
import { SEED_SONGS, type DebugWindow } from "./seed";

/**
 * 记忆上次播放位置的回归验证。
 * 注意:种子脚本必须「只播一次」——addInitScript 在 reload 时也会重跑,
 * 若无条件写 siteStatus 会把持久化的 playTimeData 冲掉(那样测的就不是本功能)。
 */
const seedOnce = async (page: Page): Promise<void> => {
  await page.addInitScript((songs) => {
    try {
      if (localStorage.getItem("__seeded")) return;
      localStorage.setItem("__seeded", "1");
      const emptyLyric = {
        hasLrcTran: false,
        hasLrcRoma: false,
        hasYrc: false,
        hasYrcTran: false,
        hasYrcRoma: false,
        lrc: [],
        yrc: [],
      };
      localStorage.setItem("siteSettings", JSON.stringify({ simulationPlaying: true }));
      localStorage.setItem(
        "musicData",
        JSON.stringify({
          playList: songs,
          playListOld: [],
          historyPlaylist: [],
          playSongData: songs[0],
          playSongSource: 0,
          playSongLyric: emptyLyric,
          localSongPath: [],
        }),
      );
      localStorage.setItem(
        "siteStatus",
        JSON.stringify({ playIndex: 0, playMode: "normal", playSongMode: "normal" }),
      );
    } catch {
      // 忽略
    }
  }, SEED_SONGS);
};

const currentTime = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (window as unknown as DebugWindow).__debugStores!.status.getState().playTimeData
        .currentTime,
  );

test("记忆上次播放位置:刷新后进度不丢失", async ({ page }) => {
  await seedOnce(page);
  await page.goto("/app/#/");
  await page.waitForFunction(() => !!(window as unknown as DebugWindow).__debugStores);
  await page.evaluate(() => {
    (window as unknown as DebugWindow).$MeTMusic_next!();
  });
  await expect.poll(() => currentTime(page), { timeout: 20_000 }).toBeGreaterThan(5);
  const before = await currentTime(page);

  // 刷新(memorySeek 默认开启,autoPlay 默认关闭)
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as DebugWindow).__debugStores);
  await page.waitForTimeout(1000);

  const after = await currentTime(page);
  console.log("before =", before, "after =", after);
  expect(after).toBeGreaterThan(before - 2);
  expect(after).toBeLessThan(before + 3);

  // 未开启自动播放 → 刷新后应为暂停态
  const playState = await page.evaluate(
    () =>
      (
        window as unknown as {
          __debugStores: { status: { getState: () => { playState: boolean } } };
        }
      ).__debugStores.status.getState().playState,
  );
  expect(playState).toBe(false);
});
