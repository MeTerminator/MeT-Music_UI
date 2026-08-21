import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright 冒烟测试配置(A2:播放链路 + 一起听双实例)。
 *
 * - dev server:复用已运行的 3000 端口实例(met-app-dev),否则自动 `pnpm dev` 拉起;
 * - 应用部署于 base=/app/ + hash 路由,故 webServer 健康检查地址为 /app/;
 * - 歌词/搜索接口经 vite dev proxy(/api)走真实后端,相关断言超时需宽容;
 * - listen-together.spec.ts 依赖生产 room API,由 E2E_NETWORK=1 显式启用。
 */
export default defineConfig({
  testDir: "e2e",
  // 单文件内用例串行(默认),避免模拟播放用例互相干扰
  fullyParallel: false,
  timeout: 60_000,
  expect: {
    // 歌词/搜索走网络,默认断言超时放宽
    timeout: 15_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/app/",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
