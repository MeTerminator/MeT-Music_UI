import { test, expect, type Page } from "@playwright/test";

/**
 * 「音乐资源自动缓存」回归:缓存播放走 blob: 链接,
 * blob: 没有扩展名,Howler 认不出编码就会在构造函数里同步 loaderror 且不创建
 * _sounds(表现为 "Cannot read properties of undefined (reading '_node')",整首播不了)。
 * 本用例用真实可解码的 WAV 走完整条缓存播放链路。
 */

/** 生成 0.5s 静音 WAV(浏览器可直接解码,免去外部音频依赖) */
const makeWav = (): Buffer => {
  const sampleRate = 8000;
  const samples = sampleRate / 2;
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
};

const SONG = {
  id: "0039MnYb0qxYhV",
  name: "晴天",
  artists: [{ id: 0, name: "周杰伦" }],
  album: { name: "叶惠美" },
  duration: "00:01",
  coverSize: {},
};

const seedCache = async (page: Page): Promise<void> => {
  await page.addInitScript((song) => {
    try {
      localStorage.setItem(
        "siteSettings",
        JSON.stringify({ useMusicCache: true, simulationPlaying: false, autoPlay: false }),
      );
      localStorage.setItem(
        "musicData",
        JSON.stringify({
          playList: [song],
          playListOld: [],
          historyPlaylist: [],
          playSongData: song,
          playSongSource: 0,
          playSongLyric: {
            hasLrcTran: false,
            hasLrcRoma: false,
            hasYrc: false,
            hasYrcTran: false,
            hasYrcRoma: false,
            lrc: [],
            yrc: [],
          },
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
  }, SONG);
};

test("音乐资源自动缓存:blob 链接能正常装载播放", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.route("**/api/web/song/url/v1**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [{ url: "https://example.com/cached-song.wav" }] }),
    }),
  );
  await page.route("**/api/web/song/lyric**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ lrc: "" }) }),
  );
  await page.route("https://example.com/cached-song.wav", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "audio/wav", "content-length": String(makeWav().length) },
      body: makeWav(),
    }),
  );

  await seedCache(page);
  await page.goto("/app/#/");
  await page.waitForFunction(() => !!(window as unknown as { __debugStores?: unknown }).__debugStores);

  // load 事件到达 → 时长写入且加载态解除(修复前这里会抛 _node TypeError)
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __debugStores: {
                  status: { getState: () => { playTimeData: { duration: number } } };
                };
              }
            ).__debugStores.status.getState().playTimeData.duration,
        ),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  expect(errors.filter((e) => e.includes("_node"))).toHaveLength(0);
  expect(errors.filter((e) => e.includes("初始化音乐播放器出错"))).toHaveLength(0);
});
