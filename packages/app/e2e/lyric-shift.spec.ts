import { test, expect, type Page } from "@playwright/test";
import { SEED_SONGS } from "./seed";

/**
 * 歌词时间平移(settings.lyricsShiftMs)回归:
 * 歌词索引平时只在播放 tick 里重算,故重点验证「暂停态下改完立即生效」。
 */

type Dbg = {
  __debugStores: {
    status: { getState: () => { playSongLyricIndex: number; playState: boolean }; setState: (p: Record<string, unknown>) => void };
    settings: { setState: (p: Record<string, unknown>) => void };
  };
  $MeTMusic_next?: () => void;
  $MeTMusic_playOrPause?: () => void;
};

const seed = async (page: Page, settings: Record<string, unknown>): Promise<void> => {
  await page.addInitScript(
    ({ songs, s }) => {
      localStorage.setItem("siteSettings", JSON.stringify({ simulationPlaying: true, ...s }));
      localStorage.setItem(
        "musicData",
        JSON.stringify({
          playList: songs,
          playListOld: [],
          historyPlaylist: [],
          playSongData: songs[0],
          playSongSource: 0,
          playSongLyric: { hasLrcTran: false, hasLrcRoma: false, hasYrc: false, hasYrcTran: false, hasYrcRoma: false, lrc: [], yrc: [] },
          localSongPath: [],
        }),
      );
      localStorage.setItem("siteStatus", JSON.stringify({ playIndex: 0, playMode: "normal", playSongMode: "normal" }));
    },
    { songs: SEED_SONGS, s: settings },
  );
};

const lyricIndex = (page: Page) =>
  page.evaluate(() => (window as unknown as Dbg).__debugStores.status.getState().playSongLyricIndex);

const setShift = (page: Page, ms: number) =>
  page.evaluate((v) => (window as unknown as Dbg).__debugStores.settings.setState({ lyricsShiftMs: v }), ms);

test("歌词时间平移:暂停态下立即改变歌词索引(普通歌词)", async ({ page }) => {
  await seed(page, { useAMLyrics: false });
  await page.goto("/app/#/");
  await page.waitForFunction(() => !!(window as unknown as { __debugStores?: unknown }).__debugStores);
  await page.evaluate(() => (window as unknown as Dbg).$MeTMusic_next!());
  await expect.poll(() => lyricIndex(page), { timeout: 20_000 }).toBeGreaterThan(2);
  await page.waitForTimeout(3000);
  await page.evaluate(() => (window as unknown as Dbg).$MeTMusic_playOrPause!());
  await page.waitForTimeout(400);

  const before = await lyricIndex(page);
  await setShift(page, -60_000); // 歌词提前 60s → 索引应前进
  await page.waitForTimeout(200);
  const earlier = await lyricIndex(page);
  await setShift(page, 60_000); // 歌词延后 60s → 索引应回到开头
  await page.waitForTimeout(200);
  const later = await lyricIndex(page);
  console.log({ before, earlier, later });

  expect(earlier).toBeGreaterThan(before);
  expect(later).toBeLessThan(before);
  expect(await page.evaluate(() => (window as unknown as Dbg).__debugStores.status.getState().playState)).toBe(false);
});
