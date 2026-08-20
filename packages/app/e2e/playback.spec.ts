import { expect, test, type Page } from "@playwright/test";
import { seedPlayback, type DebugWindow } from "./seed";

/**
 * 播放链路冒烟(A2):纯本地模拟播放,不依赖音频/CDN。
 * 歌词与搜索接口经 dev proxy(/api)走真实后端,相关断言超时宽容。
 */

/** 读取模拟播放进度(经 dev 调试出口 __debugStores) */
const readCurrentTime = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (window as unknown as DebugWindow).__debugStores!.status.getState().playTimeData
        .currentTime,
  );

/** 进入首页并触发下一曲(种子列表 playIndex 0 → 1,播放「稻香」) */
const startSimulatedPlayback = async (page: Page): Promise<void> => {
  await page.goto("/app/#/");
  // 等待宿主契约全局与 dev 调试出口就绪(main.tsx 中均为启动期挂载)
  await page.waitForFunction(() => {
    const w = window as unknown as { $MeTMusic_next?: unknown; __debugStores?: unknown };
    return typeof w.$MeTMusic_next === "function" && !!w.__debugStores;
  });
  await page.evaluate(() => {
    (window as unknown as DebugWindow).$MeTMusic_next!();
  });
  // 标题由引擎 getPlaySongName 写入:`MeT-Music - <歌名> - <歌手>`(仅播放中)
  await expect
    .poll(() => page.title(), { timeout: 15_000 })
    .toMatch(/MeT-Music - .+ - 周杰伦/);
};

test.beforeEach(async ({ page }) => {
  await seedPlayback(page);
});

test("模拟播放启动与进度推进", async ({ page }) => {
  await startSimulatedPlayback(page);

  // 进度先动起来
  await expect.poll(() => readCurrentTime(page), { timeout: 10_000 }).toBeGreaterThan(0);

  // 两次采样递增:模拟时钟(rAF + 17ms interval)持续推进
  const first = await readCurrentTime(page);
  await expect
    .poll(() => readCurrentTime(page), { timeout: 10_000 })
    .toBeGreaterThan(first);
});

test("FullPlayer 歌词渲染与 Esc 关闭", async ({ page }) => {
  await startSimulatedPlayback(page);

  // 打开全屏播放器(直接驱动状态层,等价于点击播放条封面)
  await page.evaluate(() => {
    (window as unknown as DebugWindow).__debugStores!.status.setState({
      showFullPlayer: true,
    });
  });

  // 覆盖层挂载(关闭按钮为其稳定锚点)
  const closeButton = page.locator('button[title="关闭播放器 (Esc)"]');
  await expect(closeButton).toBeVisible();

  // AMLL 歌词行渲染:类名为 hash 前缀 + "_lyricLine",故用 class*= 匹配;
  // 歌词接口走真实后端,超时放宽到 15s
  const lyricLines = page.locator('.amll-lyric-player [class*="lyricLine"]');
  await expect.poll(() => lyricLines.count(), { timeout: 15_000 }).toBeGreaterThan(5);

  // Esc 关闭后覆盖层整体卸载
  await page.keyboard.press("Escape");
  await expect(closeButton).toHaveCount(0);
  await expect(page.locator(".amll-lyric-player")).toHaveCount(0);
});

test("搜索页链路:SongList 渲染与播放全部", async ({ page }) => {
  test.skip(!!process.env.E2E_OFFLINE, "依赖真实搜索接口,离线模式跳过");

  await page.goto("/app/#/search/songs?keywords=周杰伦");

  // 「播放全部」按钮仅在结果非空时渲染
  await expect(page.getByRole("button", { name: "播放全部" })).toBeVisible({
    timeout: 20_000,
  });

  // SongList 每行有 aria-label="播放 <歌名>" 的行内播放按钮(搜索固定取 50 条)
  const rows = page.locator('button[aria-label^="播放 "]');
  await expect.poll(() => rows.count(), { timeout: 20_000 }).toBeGreaterThan(10);
});
