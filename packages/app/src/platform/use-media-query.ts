import { useSyncExternalStore } from "react";

/**
 * 媒体查询订阅(SSR 安全的 useSyncExternalStore 版)。
 * 用于「桌面/移动两套 DOM」这种 CSS 断点搞不定的场景;
 * 只是显隐差异时优先用 Tailwind 的 md: / max-md: 前缀,不要用本 hook。
 */
export const useMediaQuery = (query: string): boolean => {
  const subscribe = (onChange: () => void): (() => void) => {
    if (typeof window.matchMedia !== "function") return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
  const getSnapshot = (): boolean =>
    typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false;
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
};

/** 是否窄屏(与 Tailwind 的 md 断点一致:< 768px 视为移动端布局) */
export const useIsMobile = (): boolean => useMediaQuery("(max-width: 767px)");

/**
 * 主输入设备是否为粗指针(手机/平板触屏、手写笔)。
 *
 * 与 useIsMobile 是两件事:平板横屏宽度 >= 768px 但依然只有触屏,
 * 「双击播放」「hover 浮现的行内按钮」这类交互对它同样不可用。
 * 判定依据是设备能力而非视口宽度,故用 pointer 而不是宽度断点;
 * 纯 CSS 的显隐差异用 styles.css 里的 coarse: 变体,不必用本 hook。
 */
export const useIsTouch = (): boolean => useMediaQuery("(pointer: coarse)");
