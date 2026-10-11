import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const song = (id: number) => ({
  id, name: `测试歌曲 ${id}`, ar: [{ id: 1, name: '歌手 & <测试>' }],
  al: { id: 1, name: '专辑', picUrl: '' }, dt: 180000, fee: 0, mv: 0, ttml: 0,
});

async function serveClassic(page: Page) {
  // www 是独立部署目录,不属于 Vite public;测试直接提供仓库中的真实静态文件。
  await page.route('**/classic/player/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/classic/player/', '') || 'index.html';
    const types: Record<string, string> = { js: 'text/javascript', css: 'text/css', html: 'text/html', png: 'image/png', gif: 'image/gif', jpg: 'image/jpeg' };
    await route.fulfill({ body: await readFile(resolve('../../www/classic/player', path)),
      contentType: types[path.split('.').pop()!] || 'application/octet-stream' });
  });
  await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.resolve(); });
}

test('经典播放器:网易云分页加载、按需播放、歌词和下载', async ({ page }) => {
  await serveClassic(page);
  const offsets: number[] = [];
  const playbackIds: string[] = [];
  await page.route('http://localhost:3000/api/**', route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('platform')).toBe('netease');
    if (url.pathname.endsWith('/playlist/detail')) {
      expect(url.searchParams.get('id')).toBe('12345');
      return route.fulfill({ json: { code: 200, playlist: { trackCount: 801 } } });
    }
    if (url.pathname.endsWith('/playlist/track/all')) {
      const offset = Number(url.searchParams.get('offset'));
      offsets.push(offset);
      return route.fulfill({ json: { code: 200, songs: offset ? [song(801)] : Array.from({ length: 800 }, (_, i) => song(i + 1)) } });
    }
    if (url.pathname.endsWith('/song/url/v1')) {
      playbackIds.push(url.searchParams.get('id')!);
      return route.fulfill({ json: { code: 200, data: [{ url: `/mock/${url.searchParams.get('id')}.mp3` }] } });
    }
    if (url.pathname.endsWith('/lyric/new')) return route.fulfill({ json: { code: 200, lrc: '[00:00.00]100% <歌词>\n[00:10.00]第二句' } });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/classic/player/?tid=12345&platform=netease');
  await expect(page.locator('.music-name-cult')).toHaveCount(801);
  expect(offsets).toEqual([0, 800]);
  expect(playbackIds).toEqual([]);
  await expect(page.locator('.auth-name').nth(1)).toHaveText('歌手 & <测试>');
  await page.locator('.list-item').first().hover();
  await page.locator('.list-item').first().locator('.icon-play').click();
  await expect(page.locator('#audio')).toHaveAttribute('src', '/mock/1.mp3');
  await expect(page.locator('.lrc-item').first()).toHaveText('100% <歌词>');
  await page.locator('.btn-next').click();
  await expect(page.locator('#audio')).toHaveAttribute('src', '/mock/2.mp3');
  await page.evaluate(() => document.getElementById('downabo')!.addEventListener('click', e => e.preventDefault()));
  await page.locator('.btn-download').click();
  await expect(page.locator('#downabo')).toHaveAttribute('href', '/mock/2.mp3');
  expect(playbackIds).toEqual(['1', '2']);
});

test('经典播放器:无平台参数仍兼容 QQ 歌单和文本歌词', async ({ page }) => {
  await serveClassic(page);
  await page.route('http://localhost:3000/api/v1/**', route => {
    if (route.request().url().includes('/songlist/url')) return route.fulfill({ json: [{
      title: 'QQ 歌曲', author: 'QQ 歌手', album: 'QQ 专辑', songmid: 'qqmid', pic: '', url: '/mock/qq.mp3',
    }] });
    return route.fulfill({ body: '[00:00.00]QQ 歌词', contentType: 'text/plain' });
  });
  await page.goto('/classic/player/?tid=98765');
  await expect(page.locator('.music-name-cult')).toHaveText('QQ 歌曲');
  await page.locator('.list-item').first().hover();
  await page.locator('.list-item').first().locator('.icon-play').click();
  await expect(page.locator('#audio')).toHaveAttribute('src', '/mock/qq.mp3');
  await expect(page.locator('.lrc-item')).toHaveText('QQ 歌词');
});

test('经典播放器:快速切歌不被旧请求覆盖,无可用链接时提示', async ({ page }) => {
  await serveClassic(page);
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
  await page.route('http://localhost:3000/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/playlist/detail')) return route.fulfill({ json: { code: 200, playlist: { trackCount: 3 } } });
    if (url.pathname.endsWith('/playlist/track/all')) return route.fulfill({ json: { code: 200, songs: [song(1), song(2), song(3)] } });
    if (url.pathname.endsWith('/song/url/v1')) {
      const id = url.searchParams.get('id');
      if (id === '1') await firstGate;
      return route.fulfill({ json: { code: 200, data: [{ url: id === '3' ? null : `/mock/${id}.mp3` }] } });
    }
    return route.fulfill({ json: { code: 200, lrc: '' } });
  });
  await page.goto('/classic/player/?tid=12345&platform=netease');
  const firstRequest = page.waitForRequest(request => request.url().includes('/song/url/v1') && new URL(request.url()).searchParams.get('id') === '1');
  await page.locator('.list-item').first().hover();
  await page.locator('.list-item').first().locator('.icon-play').click();
  const request = await firstRequest;
  await page.locator('.btn-next').click();
  await expect(page.locator('#audio')).toHaveAttribute('src', '/mock/2.mp3');
  releaseFirst();
  await (await request.response())!.finished();
  await page.waitForTimeout(100); // 让已释放的旧 XHR 回调执行,验证竞态保护。
  await expect(page.locator('#audio')).toHaveAttribute('src', '/mock/2.mp3');
  await page.locator('.btn-next').click();
  await expect(page.getByText('该歌曲暂无可用播放链接，请选择其他歌曲。', { exact: true })).toBeVisible();
  await expect(page.locator('#audio')).not.toHaveAttribute('src');
});

for (const platform of ['qq', 'netease']) {
  test(`歌单页面:${platform} 的经典播放器和源页面跳转`, async ({ page }) => {
    await page.addInitScript(() => { window.open = (url) => { (window as unknown as { openedUrl: string }).openedUrl = String(url); return null; }; });
    await page.route('http://localhost:3000/api/**', route => {
      if (route.request().url().includes('/playlist/detail')) return route.fulfill({ json: {
        code: 200, playlist: { id: '12345', name: '跳转测试', coverImgUrl: '', trackCount: 1 },
      } });
      if (route.request().url().includes('/playlist/track/all')) return route.fulfill({ json: { code: 200, songs: [song(1)] } });
      return route.fulfill({ status: 404 });
    });
    await page.goto(`/app/#/playlist?id=12345&platform=${platform}`);
    await page.locator('main').getByRole('button', { name: '更多操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '打开经典播放器' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { openedUrl: string }).openedUrl)).toBe(`/classic/player/?tid=12345&platform=${platform}`);
    await page.locator('main').getByRole('button', { name: '更多操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '打开源页面链接' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { openedUrl: string }).openedUrl)).toBe(platform === 'netease'
      ? 'https://music.163.com/#/playlist?id=12345' : 'https://y.qq.com/n/ryqq/playlist/12345');
  });
}
