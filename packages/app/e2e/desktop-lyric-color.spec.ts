import { vividDesktopLyricColor } from "../src/platform/desktop-lyric-color";
import { expect, test } from "@playwright/test";

test("desktop fallback persists and updates modern and legacy hosts while paused", async ({ page }) => {
  await page.goto("/app/#/setting");
  await page.waitForFunction(() => Boolean((window as any).__debugStores));
  await page.getByRole("button", { name: "歌词", exact: true }).click();
  const picker = page.getByLabel("桌面歌词备选主题色", { exact: true });
  await expect(picker).toHaveValue("#04cd6f");
  await page.evaluate(() => {
    const w = window as any;
    const { status } = w.__debugStores;
    status.setState({ playState: false, coverTheme: {
      dark: { primary: "255, 255, 255", bg: "240, 232, 222", mainBg: "255, 255, 255" },
      light: { shadeTwo: "245, 245, 245", bg: "180, 50, 40" },
    } });
    w.__colorMessages = [];
    w.$MeTMusic_registerHost({ onPlaybackSync: (data: any) => w.__colorMessages.push(data) });
  });
  await expect.poll(() => page.evaluate(() => (window as any).__colorMessages.at(-1)?.coverTheme.dark.bg)).toBe("4, 205, 111");
  await picker.fill("#ff8800");
  const result = await page.evaluate(() => {
    const w = window as any;
    return { sent: w.__colorMessages.at(-1), original: w.__debugStores.status.getState().coverTheme };
  });
  expect(result.sent).toMatchObject({ kind: "song", coverTheme: {
    dark: { primary: "255, 136, 0", bg: "255, 136, 0", mainBg: "255, 255, 255" },
    light: { shadeTwo: vividDesktopLyricColor("255, 136, 0"), bg: "180, 50, 40" },
  } });
  expect(result.original.dark.bg).toBe("240, 232, 222");
  await page.evaluate(() => {
    const w = window as any;
    w.__legacyColors = [];
    w.$MeTMusic_Hook = (data: any) => w.__legacyColors.push(data);
    w.$MeTMusic_registerHost({});
  });
  await picker.fill("#778899");
  await expect.poll(() => page.evaluate(() => (window as any).__legacyColors.at(-1)?.coverTheme.dark.bg)).toBe("119, 136, 153");
  await page.reload();
  await page.getByRole("button", { name: "歌词", exact: true }).click();
  await expect(picker).toHaveValue("#778899");
  await page.getByRole("button", { name: "恢复默认", exact: true }).click();
  await expect(picker).toHaveValue("#04cd6f");
});
