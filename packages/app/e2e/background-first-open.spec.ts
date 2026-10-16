import { expect, test } from "@playwright/test";
import { seedPlayback } from "./seed";

for (const renderer of ["mesh", "isolation", "pixi"]) {
  test(`首次打开全屏播放器，未播放音频也绘制封面背景（${renderer}）`, async ({ page }) => {
    await seedPlayback(page);
    // 在实际 WebGL 绘制时采样屏幕帧，避免 canvas 默认清理缓冲区后读到透明像素。
    await page.addInitScript(() => {
      (window as any).__backgroundPixels = [];
      for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        const draw = proto.drawArrays;
        proto.drawArrays = function (...args) {
          draw.apply(this, args);
          if (!this.getParameter(this.FRAMEBUFFER_BINDING)
            && (this.canvas as HTMLCanvasElement).closest('[data-testid="full-player-background"]')) {
            const pixel = new Uint8Array(4);
            this.readPixels(Math.floor(this.drawingBufferWidth / 2), Math.floor(this.drawingBufferHeight / 2),
              1, 1, this.RGBA, this.UNSIGNED_BYTE, pixel);
            (window as any).__backgroundPixels.push([...pixel]);
          }
        };
        // Pixi 使用索引绘制。
        const drawElements = proto.drawElements;
        proto.drawElements = function (...args) {
          drawElements.apply(this, args);
          if (!this.getParameter(this.FRAMEBUFFER_BINDING)
            && (this.canvas as HTMLCanvasElement).closest('[data-testid="full-player-background"]')) {
            const pixel = new Uint8Array(4);
            this.readPixels(Math.floor(this.drawingBufferWidth / 2), Math.floor(this.drawingBufferHeight / 2),
              1, 1, this.RGBA, this.UNSIGNED_BYTE, pixel);
            (window as any).__backgroundPixels.push([...pixel]);
          }
        };
      }
    });
    await page.route("**/lyric/**", route => route.fulfill({ json: {
      code: 200, source: "network", lrc: "", lrctrans: "", qrc: "", qrctrans: "", qrcroma: "",
    } }));
    await page.goto("/app/#/");
    await page.waitForFunction(() => Boolean((window as any).__debugStores));
    await page.evaluate(renderer => {
      const { music, status, settings } = (window as any).__debugStores;
      // 使用本地生成的彩色 PNG，排除图床、网络及音频播放的影响。
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ed2969";
      ctx.fillRect(0, 0, 64, 64);
      const cover = canvas.toDataURL();
      settings.setState({ playerBackgroundType: "amllAnimation", amllBackgroundRenderer: renderer });
      music.setState({ playSongData: { ...music.getState().playSongData, coverSize: { l: cover } } });
      status.setState({ playState: false, coverBackground: null, coverTheme: {}, showFullPlayer: true });
    }, renderer);
    await expect(page.getByTestId("full-player-background").locator("canvas")).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__backgroundPixels.some((pixel: number[]) =>
      pixel[3] > 0 && Math.max(...pixel.slice(0, 3)) - Math.min(...pixel.slice(0, 3)) > 25,
    ))).toBe(true);
    expect(await page.evaluate(() => (window as any).__debugStores.status.getState().playState)).toBe(false);
  });
}
