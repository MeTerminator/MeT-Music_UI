import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('NAC 首块起播、远距离跳转与暂停后台解码', async ({ page }) => {
  const { makeFixture } = await import('../tests/nac-fixture');
  const nac = Buffer.from(await makeFixture(1024));
  await page.route('**/api/**', (route) => new URL(route.request().url()).pathname.startsWith('/api/')
    ? route.fulfill({ status: 404, json: {} }) : route.continue());
  await page.route('**/nac-fixture', (route) => route.fulfill({ body: nac, contentType: 'application/octet-stream' }));
  await page.goto('/app/');
  await page.mouse.click(1, 1);
  const result = await page.evaluate(async () => {
    const modulePath = '/app/src/player/nac/prepare.ts';
    const { decodeNacUrl } = await import(/* @vite-ignore */ modulePath);
    const progress: number[] = [];
    const prepared = await decodeNacUrl('/nac-fixture', new AbortController().signal, (n: number) => progress.push(n));
    const audio = prepared.player;
    const firstProgress = progress.at(-1) ?? 0;
    async function until(condition: () => boolean): Promise<void> {
      const deadline = performance.now() + 30000;
      while (!condition()) {
        if (performance.now() > deadline) throw new Error('等待流式音频状态超时');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    try {
      audio.volume(0.2);
      audio.play();
      await until(() => audio.seek() > 0.05);
      const startedBeforeComplete = (progress.at(-1) ?? 0) < 100;
      const target = audio.duration() - 5;
      audio.seek(target);
      audio.rate(2);
      await until(() => audio.seek() > target + 0.05);
      audio.pause();
      // 等音频线程确认 pause，排除已发出但尚未送达的时钟回报。
      await new Promise((resolve) => setTimeout(resolve, 100));
      const paused = audio.seek();
      const progressAtPause = progress.at(-1) ?? 0;
      await until(() => progress.at(-1) === 100);
      return { firstProgress, startedBeforeComplete, progressAtPause, paused, finalSeek: audio.seek(), playing: audio.playing() };
    } finally { prepared.dispose(); }
  });
  expect(result.firstProgress).toBeLessThan(100);
  expect(result.startedBeforeComplete).toBe(true);
  expect(result.progressAtPause).toBeLessThan(100);
  expect(result.finalSeek).toBeCloseTo(result.paused, 2);
  expect(result.playing).toBe(false);
});

for (const html5Player of [false, true]) {
  test(`QQ NAC 设置 → 取链 → 解码 → 流式装载（HTML5=${html5Player}）`, async ({ page }) => {
    const nac = await readFile(new URL('../tests/fixtures/nac/synthetic.nac', import.meta.url));
    const requests: string[] = [];
    await page.addInitScript((html5) => {
      const song = { id: 'nac-test', name: 'NAC 测试', artists: [{ name: '测试' }], duration: '00:01', coverSize: {} };
      localStorage.setItem('siteSettings', JSON.stringify({ songLevel: 'nac', useMusicCache: false, html5Player: html5, simulationPlaying: false, autoPlay: false }));
      localStorage.setItem('musicData', JSON.stringify({ playList: [song], playSongData: song, playListOld: [], historyPlaylist: [], playSongSource: 0, localSongPath: [] }));
      localStorage.setItem('siteStatus', JSON.stringify({ playIndex: 0, playMode: 'normal', playSongMode: 'normal' }));
    }, html5Player);
    await page.route('**/api/**', (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname.endsWith('/song/url/v1')) {
        requests.push(`${url.searchParams.get('platform')}:${url.searchParams.get('level')}`);
        return route.fulfill({ json: { code: 200, data: [{ id: 'nac-test', url: 'http://localhost:3000/nac-fixture', size: nac.length, track_info: { mid: 'nac-test' }, time: 517, level: 'NAC', code: 200 }] } });
      }
      if (url.pathname.endsWith('/lyric/new')) return route.fulfill({ json: { code: 200, lrc: '', lrctrans: '', qrc: '', qrctrans: '', qrcroma: '', source: 'network' } });
      return route.fulfill({ status: 404, json: {} });
    });
    await page.route('**/nac-fixture', (route) => route.fulfill({ body: nac, contentType: 'application/octet-stream', headers: { 'access-control-allow-origin': '*' } }));
    await page.goto('/app/');
    await expect.poll(() => page.evaluate(() => {
      const stores = (window as any).__debugStores;
      return stores?.status.getState().playTimeData.duration ?? 0;
    })).toBeGreaterThan(0.5);
    expect(requests).toContain('qq:nac');
    await page.evaluate(() => (window as any).__debugStores.status.setState({ showSettingsPanel: true }));
    await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '播放', exact: true }).click();
    const qq = page.getByText('QQ 音乐音质选择', { exact: true }).locator('../../..');
    await expect(qq.getByRole('combobox')).toContainText('NAC');
  });
}
