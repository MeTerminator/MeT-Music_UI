import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { seedPlayback } from "./seed";

const engineUrl =
  "/app/@fs" +
  fileURLToPath(new URL("../../core/src/player/engine.ts", import.meta.url));

function silentWav() {
  const samples = 180 * 8000;
  const wav = Buffer.alloc(44 + samples, 128);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(8000, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples, 40);
  return wav;
}

async function setup(
  page: Page,
  brokenHQ = false,
  metadataInPlayback = true,
  netease = false,
) {
  const levels: string[] = [];
  const infoRequests: string[] = [];
  await seedPlayback(page);
  await page.addInitScript((netease) => {
    localStorage.setItem(
      "siteSettings",
      JSON.stringify({
        simulationPlaying: false,
        songLevel: "rs",
        html5Player: true,
        memorySeek: false,
        useMusicCache: false,
        songVolumeFade: false,
        autoPlay: false,
        themeType: "dark",
        themeAuto: false,
        useAMLyrics: false,
        playerBackgroundType: "gradient",
        neteaseSongLevel: "hires",
      }),
    );
    if (netease) {
      const music = JSON.parse(localStorage.getItem("musicData") || "{}");
      music.playList = music.playList.map((song: any, index: number) => ({
        ...song,
        id: String(123 + index),
        source: "netease",
      }));
      music.playSongData = music.playList[0];
      localStorage.setItem("musicData", JSON.stringify(music));
    }
  }, netease);
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const track = {
      id: url.searchParams.get("id") || "0039MnYb0qxYhV",
      mid: url.searchParams.get("id") || "0039MnYb0qxYhV",
      title: "晴天",
      available_qualities: netease
        ? ["standard", "exhigh", "lossless", "hires"]
        : ["HQ", "SQ", "RS", "DTSX"],
    };
    if (url.pathname.endsWith("/song/url/v1")) {
      const level = (url.searchParams.get("level") || "").toUpperCase();
      levels.push(level);
      const actual = netease
        ? level === "EXHIGH"
          ? "exhigh"
          : "lossless"
        : level === "HQ"
          ? "HQ"
          : "SQ";
      const { available_qualities: _, ...withoutMetadata } = track;
      return route.fulfill({
        json: {
          code: 200,
          data: [
            {
              id: track.id,
              url: `https://media.example.test/${actual}.wav`,
              size: 1440044,
              track_info: metadataInPlayback ? track : withoutMetadata,
              time: 180000,
              level: actual,
              code: 200,
            },
          ],
        },
      });
    }
    if (url.pathname.endsWith("/extra/music/info")) {
      const id = url.searchParams.get("mids") || track.id;
      infoRequests.push(id);
      return route.fulfill({
        json: { [id]: { track_info: { ...track, id, mid: id } } },
      });
    }
    if (url.pathname.endsWith("/lyric/ttml"))
      return route.fulfill({ json: { status: "no_lyrics" } });
    if (url.pathname.endsWith("/lyric/new"))
      return route.fulfill({
        json: {
          code: 200,
          source: "network",
          lrc: "",
          lrctrans: "",
          qrc: "",
          qrctrans: "",
          qrcroma: "",
        },
      });
    return route.fulfill({ status: 404, json: { detail: "Offline test" } });
  });
  const wav = silentWav();
  await page.route("https://media.example.test/**", (route) => {
    if (brokenHQ && route.request().url().includes("/HQ.wav"))
      return route.fulfill({ status: 404 });
    return route.fulfill({
      status: 200,
      contentType: "audio/wav",
      headers: { "access-control-allow-origin": "*", "accept-ranges": "bytes" },
      body: wav,
    });
  });
  await page.goto("/app/#/");
  await expect(page.getByTestId("quality-trigger-bar")).toContainText("无损");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__debugStores.status.getState().playLoading,
      ),
    )
    .toBe(false);
  // Establish a real user-initiated playback session before seeking a paused source.
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__debugStores.status.getState().playState,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__debugStores.status.getState().playState,
      ),
    )
    .toBe(false);
  return { levels, infoRequests };
}

async function seek(page: Page, seconds: number) {
  await page.evaluate(
    async ({ engineUrl, seconds }) => {
      const engine = await import(engineUrl);
      engine.setSeek(seconds);
    },
    { engineUrl, seconds },
  );
}

async function state(page: Page) {
  return page.evaluate(() => {
    const stores = (window as any).__debugStores;
    return {
      quality: stores.status.getState().playbackQuality,
      playing: stores.status.getState().playState,
      seek: stores.status.getState().playSeek,
      song: stores.music.getState().playSongData.id,
      preferred: stores.settings.getState().songLevel,
    };
  });
}

test("two quality entries show actual and preferred levels, preserve seek and clear the temporary choice on next song", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { levels } = await setup(page);
  await seek(page, 37.25);
  await page.getByTestId("quality-trigger-bar").click();
  await expect(
    page.getByRole("menuitem", { name: "无损 FLAC，当前使用", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Hi-Res，设置期望", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /DTS/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("quality-normal.png") });
  await page
    .getByRole("menuitem", { name: "极高 MP3 320", exact: true })
    .click();
  await expect(page.getByTestId("quality-trigger-bar")).toContainText("HQ");
  await expect
    .poll(async () => (await state(page)).quality?.switching)
    .toBe(false);
  expect(await state(page)).toMatchObject({
    playing: false,
    preferred: "rs",
    quality: { actualLevel: "HQ", overrideLevel: "HQ" },
  });
  expect((await state(page)).seek).toBeCloseTo(37.25, 1);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("siteStatus") || "{}").playbackQuality,
    ),
  ).toBeUndefined();

  await page.evaluate(() =>
    (window as any).__debugStores.status.setState({ showFullPlayer: true }),
  );
  const controls = page.getByTestId("full-player-controls");
  await expect(controls).toBeVisible();
  await expect(page.getByTestId("quality-trigger-overlay")).toContainText("HQ");
  expect((await controls.boundingBox())!.width).toBeGreaterThan(880);
  await page.getByTestId("quality-trigger-overlay").click();
  await expect(
    page.getByRole("menuitem", { name: "极高 MP3 320，当前使用", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(2400); // exceeds the fullscreen controls' inactivity timeout
  await expect(controls).toBeVisible();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("quality-fullscreen.png"),
  });
  await page.keyboard.press("Escape");
  await controls.getByTitle("播放", { exact: true }).click();
  await expect.poll(async () => (await state(page)).playing).toBe(true);
  await seek(page, 42);
  await page.getByTestId("quality-trigger-overlay").click();
  await page.getByRole("menuitem", { name: "无损 FLAC", exact: true }).click();
  await expect(page.getByTestId("quality-trigger-overlay")).toContainText(
    "无损",
  );
  await expect
    .poll(async () => (await state(page)).quality?.switching)
    .toBe(false);
  expect((await state(page)).playing).toBe(true);
  expect((await state(page)).seek).toBeGreaterThanOrEqual(42);
  expect((await state(page)).seek).toBeLessThan(44);
  await controls.getByTitle("下一曲", { exact: true }).click();
  await expect
    .poll(async () => (await state(page)).song)
    .toBe("003OUlho2HcRHC");
  await expect
    .poll(async () => (await state(page)).quality?.overrideLevel)
    .toBe(null);
  expect(levels.at(-1)).toBe("RS");
});

test("media failure restores original quality and progress rather than skipping the song", async ({
  page,
}) => {
  await setup(page, true);
  await seek(page, 19.5);
  await page.getByTestId("quality-trigger-bar").click();
  await page
    .getByRole("menuitem", { name: "极高 MP3 320", exact: true })
    .click();
  await expect(page.getByText("音质切换失败，已保留原音质")).toBeVisible();
  await expect
    .poll(async () => (await state(page)).quality?.switching)
    .toBe(false);
  const current = await state(page);
  expect(current).toMatchObject({
    song: "0039MnYb0qxYhV",
    playing: false,
    preferred: "rs",
    quality: { actualLevel: "SQ", overrideLevel: null },
  });
  expect(current.seek).toBeCloseTo(19.5, 1);
});

test("loads per-song choices only when metadata is missing and the menu opens", async ({
  page,
}) => {
  const { infoRequests } = await setup(page, false, false);
  expect(infoRequests).toEqual([]);
  await page.getByTestId("quality-trigger-bar").click();
  await expect(
    page.getByRole("menuitem", { name: "极高 MP3 320", exact: true }),
  ).toBeVisible();
  expect(infoRequests).toEqual(["0039MnYb0qxYhV"]);
});

for (const width of [1024, 800]) {
  test(`fullscreen controls fit without overlapping the quality control at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await page.evaluate(() =>
      (window as any).__debugStores.status.setState({ showFullPlayer: true }),
    );
    const controls = page.getByTestId("full-player-controls");
    await expect(controls).toBeVisible();
    const quality = await page
      .getByTestId("quality-trigger-overlay")
      .boundingBox();
    const previous = await controls
      .getByTitle("上一曲", { exact: true })
      .boundingBox();
    expect(quality!.x + quality!.width).toBeLessThanOrEqual(previous!.x);
  });
}

test("NetEase uses the same per-play selector without changing its global preference", async ({
  page,
}) => {
  await setup(page, false, true, true);
  await seek(page, 12.5);
  await page.getByTestId("quality-trigger-bar").click();
  await expect(
    page.getByRole("menuitem", { name: "无损，当前使用", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Hi-Res，设置期望", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "极高", exact: true }).click();
  await expect(page.getByTestId("quality-trigger-bar")).toContainText("极高");
  await expect
    .poll(async () => (await state(page)).quality?.switching)
    .toBe(false);
  expect((await state(page)).quality).toMatchObject({
    actualLevel: "exhigh",
    overrideLevel: "exhigh",
  });
  expect((await state(page)).seek).toBeCloseTo(12.5, 1);
  expect(
    await page.evaluate(
      () => (window as any).__debugStores.settings.getState().neteaseSongLevel,
    ),
  ).toBe("hires");
});
