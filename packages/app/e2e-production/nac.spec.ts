import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeFixture } from '../tests/nac-fixture';

// 仅使用页面和持久化状态，验证压缩构建中的 Worker/Worklet 与 base 资源路径。
test('生产构建：QQ NAC 首块装载后可播放、暂停并保留真实进度', async ({ page }) => {
  const nac = Buffer.from(await makeFixture(128));
  const resources: string[] = [];
  const errors: string[] = [];
  const mjsRequests: string[] = [];
  // 复现线上默认静态 MIME：.mjs 返回 octet-stream，.js 正常返回 JavaScript。
  await page.context().route('**/app/nac/vendor/*.mjs', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    mjsRequests.push(name);
    const body = await readFile(new URL(`../node_modules/onnxruntime-web/dist/${name}`, import.meta.url));
    return route.fulfill({ body, contentType: 'application/octet-stream' });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.context().on('response', (response) => {
    if (response.ok()) resources.push(new URL(response.url()).pathname);
  });
  await page.addInitScript(() => {
    const song = { id: 'nac-production', name: 'NAC 流式测试', artists: [{ name: '测试' }], duration: '00:24', coverSize: {} };
    localStorage.setItem('siteSettings', JSON.stringify({ songLevel: 'nac', useMusicCache: false, simulationPlaying: false, autoPlay: false, songVolumeFade: false }));
    localStorage.setItem('musicData', JSON.stringify({ playList: [song], playSongData: song, playListOld: [], historyPlaylist: [], playSongSource: 0, localSongPath: [] }));
    localStorage.setItem('siteStatus', JSON.stringify({ playIndex: 0, playMode: 'normal', playSongMode: 'normal' }));
  });
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/song/url/v1')) {
      expect(url.searchParams.get('level')).toBe('nac');
      return route.fulfill({ json: { code: 200, data: [{ id: 'nac-production', url: 'https://audio.test/track.nac', size: nac.length, track_info: { mid: 'nac-production' }, time: 24000, level: 'NAC', code: 200 }] } });
    }
    if (url.pathname.endsWith('/lyric/new')) return route.fulfill({ json: { code: 200, lrc: '', lrctrans: '', qrc: '', qrctrans: '', qrcroma: '', source: 'network' } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.route('https://audio.test/track.nac', (route) => route.fulfill({ body: nac, contentType: 'application/octet-stream', headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('/app/');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('siteStatus') ?? '{}').playTimeData?.duration ?? 0)).toBeGreaterThan(20);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('siteStatus') ?? '{}').playTimeData?.currentTime ?? 0)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  const paused = await page.evaluate(() => JSON.parse(localStorage.getItem('siteStatus') ?? '{}').playTimeData.currentTime);
  expect(paused).toBeGreaterThan(0);
  expect(resources.some((url) => /\/assets\/audio-worklet-.*\.js$/.test(url))).toBe(true);
  expect(resources.some((url) => /\/assets\/worker-.*\.js$/.test(url))).toBe(true);
  expect(resources).toContain('/app/nac/models/nac.onnx');
  expect(resources).toContain('/app/nac/vendor/ort.wasm.min.js');
  expect(resources).toContain('/app/nac/vendor/ort-wasm-simd-threaded.js');
  expect(resources).toContain('/app/nac/vendor/ort-wasm-simd-threaded.wasm');
  expect(mjsRequests).toEqual([]);
  expect(errors).toEqual([]);
});
