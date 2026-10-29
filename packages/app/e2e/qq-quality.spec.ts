import { expect, test } from "@playwright/test";

test("QQ download uses song availability, requests exact new quality and keeps the actual extension", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests: string[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.endsWith("/extra/music/info"))
      return route.fulfill({
        json: {
          songmid: {
            track_info: {
              mid: "songmid",
              id: 42,
              title: "Quality example",
              singer: [{ name: "Artist" }],
              available_qualities: ["SQ", "Q360V3", "DA"],
            },
          },
        },
      });
    if (url.pathname.endsWith("/extra/music/url")) {
      requests.push(url.searchParams.get("music_quality") || "");
      return route.fulfill({
        json: [
          {
            track_info: {
              mid: "songmid",
              title: "Quality example",
              singer: [{ name: "Artist" }],
              file_url: "https://media.example.test/Q003mediamid.ogg?vkey=test",
              file_quality: "Q360V3",
              file_name: "Q003mediamid.ogg",
              file_size: 4,
            },
          },
        ],
      });
    }
    return route.fulfill({ status: 404, json: { detail: "Offline test" } });
  });
  await page.route("https://media.example.test/**", (route) =>
    route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
      body: "OggS",
    }),
  );
  await page.goto(
    "/app/#/download?id=songmid&music_quality=Q360V3&platform=qq",
  );
  await expect(
    page.getByText("Quality example", { exact: true }),
  ).toBeVisible();
  const select = page.getByRole("combobox").filter({ hasText: "臻品全景声" });
  await expect(select).toContainText("臻品全景声 7.1.4");
  await select.click();
  await expect(
    page.getByRole("option", { name: "杜比全景声", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "极高 MP3 320", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("option", { name: "臻品全景声 7.1.4", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "立即下载歌曲文件", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.ogg$/);
  expect(requests).toEqual(["Q360V3"]);
  expect(errors).toEqual([]);
});

test("QQ playback settings exclude download-only spatial codecs", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => {
    if (!new URL(route.request().url()).pathname.startsWith("/api/"))
      return route.continue();
    return route.fulfill({ status: 404, json: { detail: "Offline test" } });
  });
  await page.goto("/app/#/setting");
  await page
    .getByLabel("设置分类")
    .getByRole("button", { name: "播放", exact: true })
    .click();
  await expect(
    page.getByText("QQ 音乐音质选择", { exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox").filter({ hasText: "极高 MP3 320" }).click();
  await expect(
    page.getByRole("option", { name: "儿童护耳", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Hi-Res", exact: true }),
  ).toBeVisible();
  for (const name of [
    "DTS 旧版",
    "DTS:X",
    "杜比全景声",
    "360 Reality Audio",
    "臻品全景声 7.1.4",
  ]) {
    await expect(page.getByRole("option", { name, exact: true })).toHaveCount(
      0,
    );
  }
});
