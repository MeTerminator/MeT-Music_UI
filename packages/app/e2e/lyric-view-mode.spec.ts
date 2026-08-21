import { expect, test, type Page } from "@playwright/test";
import { seedPlayback, type DebugWindow } from "./seed";

/**
 * 全屏播放器歌词视图三态(取代原来的「纯净歌词」布尔开关)。
 * 顶部左上角图标按钮按「歌词占比递增」循环:
 * 封面 + 歌词 → 仅歌词 → 关闭歌词 → 封面 + 歌词。
 *
 * 两栏常驻挂载、靠封面栏宽度一个量驱动过渡,所以这里既断言模式循环,
 * 也断言两栏宽度确实随模式变化(而不是被 mount/unmount 换掉)。
 */

const seedLyric = (page: Page) =>
  page.evaluate(() => {
    const lrc = Array.from({ length: 20 }, (_, i) => ({
      time: i * 8,
      content: `这是第 ${i + 1} 行歌词`,
    }));
    const lrcAM = lrc.map((l, i) => ({
      words: [
        {
          startTime: l.time * 1000,
          endTime: (i + 1) * 8000,
          word: l.content,
          romanWord: "",
          obscene: false,
        },
      ],
      translatedLyric: "",
      romanLyric: "",
      startTime: l.time * 1000,
      endTime: (i + 1) * 8000,
      isBG: false,
      isDuet: false,
    }));
    (window as unknown as DebugWindow).__debugStores!.music.setState({
      playSongLyric: {
        hasLrcTran: false, hasLrcRoma: false, hasYrc: false, hasYrcTran: false, hasYrcRoma: false,
        lrc, yrc: [], lrcAM, yrcAM: [], ttml: [],
      },
    });
    (window as unknown as DebugWindow).__debugStores!.status.setState({ showFullPlayer: true });
  });

/** 封面栏 / 歌词栏的实际宽度(主体是全屏层里 z-10 的那个 flex 行) */
const paneWidths = (page: Page) =>
  page.evaluate(() => {
    const body = document.querySelector<HTMLElement>(".fixed.inset-0.z-40 .relative.z-10.flex");
    const panes = body ? (Array.from(body.children) as HTMLElement[]) : [];
    return panes.map((p) => Math.round(p.getBoundingClientRect().width));
  });

test.use({ viewport: { width: 1440, height: 900 } });

test("歌词视图三态:图标循环切换且两栏宽度随之伸缩", async ({ page }) => {
  await seedPlayback(page);
  await page.goto("/app/#/");
  await page.waitForFunction(() => !!(window as unknown as { __debugStores?: unknown }).__debugStores);
  await page.evaluate(() => { (window as unknown as DebugWindow).$MeTMusic_next!(); });
  await page.waitForTimeout(600);
  await seedLyric(page);
  await expect(page.locator(".amll-lyric-player")).toBeVisible();
  await page.waitForTimeout(800);

  const toggle = page.locator('button[aria-label^="歌词视图"]');
  /** 控制条静止 2 秒会淡出,每次操作前先唤一下 */
  const wake = async () => {
    await page.mouse.move(720, 450);
    await page.mouse.move(721, 451);
  };

  await wake();
  await expect(toggle).toHaveAttribute("aria-label", "歌词视图:封面 + 歌词");
  const both = await paneWidths(page);
  console.log("封面+歌词:", both);
  expect(both[0]).toBeGreaterThan(600); // 45% of 1440 = 648
  expect(both[1]).toBeGreaterThan(600);

  await toggle.click();
  await page.waitForTimeout(900);
  await wake();
  await expect(toggle).toHaveAttribute("aria-label", "歌词视图:仅歌词");
  const only = await paneWidths(page);
  console.log("仅歌词:", only);
  expect(only[0]).toBe(0); // 封面栏收到 0(仍挂载,故还在 children 里)
  expect(only[1]).toBe(1440);

  await toggle.click();
  await page.waitForTimeout(900);
  await wake();
  await expect(toggle).toHaveAttribute("aria-label", "歌词视图:关闭歌词");
  const hidden = await paneWidths(page);
  console.log("关闭歌词:", hidden);
  expect(hidden[0]).toBe(1440);
  expect(hidden[1]).toBe(0); // 歌词栏被挤到 0,padding 不再撑住它

  await toggle.click();
  await page.waitForTimeout(900);
  await wake();
  await expect(toggle).toHaveAttribute("aria-label", "歌词视图:封面 + 歌词");

  // 切换过程中两栏都还在 DOM 里(有过渡而非直接换掉)
  await toggle.click();
  await page.waitForTimeout(150);
  const mid = await paneWidths(page);
  console.log("过渡中:", mid);
  expect(mid[0]).toBeGreaterThan(0);
  expect(mid[0]).toBeLessThan(both[0]);
});
