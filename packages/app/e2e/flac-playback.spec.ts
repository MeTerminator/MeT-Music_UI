import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { expect, test } from "@playwright/test";

test("FLAC 首批数据即可起播，完整解码后可重复精确定位", async ({ page }) => {
  const bytes = await readFile(process.env.FLAC_TEST_FILE || new URL("../tests/fixtures/flac/stereo.flac", import.meta.url));
  let metadataEnd = 4;
  while (metadataEnd + 4 < bytes.length) {
    const last = !!(bytes[metadataEnd] & 128);
    const length = bytes.readUIntBE(metadataEnd + 1, 3);
    metadataEnd += length + 4;
    if (last) break;
  }
  const split = metadataEnd + Math.min(256 * 1024, Math.floor((bytes.length - metadataEnd) / 2));
  let finished = false;
  let release = () => {};
  // 保留后半段不发送；首块起播前若请求整首 arrayBuffer，本测试会超时。
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "audio/flac", "content-length": bytes.length,
      "access-control-allow-origin": "*" });
    response.write(bytes.subarray(0, split));
    release = () => { finished = true; response.end(bytes.subarray(split)); };
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  try {
    await page.route("http://localhost:3000/api/**", (route) => route.fulfill({ status: 404, json: {} }));
    await page.goto("/app/");
    await page.mouse.click(1, 1);
    const first = await page.evaluate(async (url) => {
      const modulePath = "/app/src/player/spatial/prepare.ts";
      const { decodeSpatialUrl } = await import(modulePath);
      const w = window as any;
      w.__flacProgress = 0;
      const prepared = await decodeSpatialUrl("flac", url, new AbortController().signal,
        (value: number) => { w.__flacProgress = value; }, true);
      if (!("player" in prepared)) throw new Error("未使用流式 PCM 播放器");
      w.__flacPrepared = prepared;
      w.__flacError = null;
      w.__flacWaiting = false;
      prepared.player.on("waiting", () => { w.__flacWaiting = true; });
      prepared.player.on("playing", () => { w.__flacWaiting = false; });
      prepared.player.on("loaderror", (...args: unknown[]) => {
        w.__flacError = args.map((arg) => arg instanceof Error ? arg.message : String(arg));
      });
      prepared.player.play();
      return { progress: w.__flacProgress, duration: prepared.player.duration() };
    }, `http://127.0.0.1:${address.port}/audio.flac`);
    expect(finished).toBe(false);
    expect(first.progress).toBeLessThan(100);
    await expect.poll(() => page.evaluate(() => (window as any).__flacPrepared.player.seek())).toBeGreaterThan(0.1);
    expect(finished).toBe(false);
    await page.evaluate(() => {
      const audio = (window as any).__flacPrepared.player;
      audio.seek(audio.duration() - 1);
    });
    await expect.poll(() => page.evaluate(() => (window as any).__flacWaiting)).toBe(true);
    await page.waitForTimeout(200); // 数据尚未发送，验证采样时钟确实停住。
    const frozen = await page.evaluate(() => (window as any).__flacPrepared.player.seek());
    expect(frozen).toBeCloseTo(first.duration - 1, 2);
    expect(finished).toBe(false);
    release();
    const result = await page.evaluate(async () => {
      const w = window as any;
      const audio = w.__flacPrepared.player;
      async function until(condition: () => boolean) {
        const deadline = performance.now() + 20000;
        while (!condition()) {
          if (w.__flacError) throw new Error(JSON.stringify(w.__flacError));
          if (performance.now() > deadline) throw new Error(`FLAC 未完成: progress=${w.__flacProgress}, state=${audio.state()}`);
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
      await until(() => w.__flacProgress === 100);
      const positions: number[] = [];
      for (const target of [3, 1, 6, 3]) {
        audio.seek(target);
        audio.play();
        await until(() => audio.seek() > target + 0.05);
        positions.push(audio.seek() - target);
      }
      return { progress: w.__flacProgress, positions, error: w.__flacError };
    });
    expect(result).toMatchObject({ progress: 100, error: null });
    expect(result.positions).toHaveLength(4);
    for (const delta of result.positions) expect(delta).toBeLessThan(0.2);
  } finally {
    await page.evaluate(() => (window as any).__flacPrepared?.dispose()).catch(() => {});
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
