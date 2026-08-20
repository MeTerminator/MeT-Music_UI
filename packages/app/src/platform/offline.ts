import { api } from "@met/core";

/**
 * 断网提示(对照旧 App.vue $canNotConnect):
 * 网络层错误/超时时弹出确认对话框——「网络连接错误,请检查您当前的网络状态」,
 * 确认「重试」则整页刷新(location.reload,与旧 onPositiveClick 一致)。
 *
 * React 下实现选型:window.confirm(同步阻塞,天然去重、零依赖、最可靠),
 * 外加模块级 30s 防抖——批量请求同时失败时只弹一次
 * (旧版靠 $dialog.destroyAll() 达到同样效果)。
 */

const PROMPT_INTERVAL_MS = 30_000;

let lastPromptAt = 0;

/** 注册断网处理回调(main.tsx 启动时调用一次) */
export const initOfflineHandler = (): void => {
  api.setOfflineHandler((error: unknown) => {
    console.error(
      "网络连接错误：",
      error instanceof Error ? error.message : String(error),
    );
    const now = Date.now();
    if (now - lastPromptAt < PROMPT_INTERVAL_MS) return;
    lastPromptAt = now;
    if (window.confirm("网络连接错误，请检查您当前的网络状态。是否重试？")) {
      location.reload();
    }
  });
};
