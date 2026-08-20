/**
 * 全局键盘快捷键。
 *
 * 移植自旧 src/utils/globalShortcut.js + App.vue 的 window keyup 注册:
 * - Space:播放 / 暂停(输入焦点或 /videos-player 路由下豁免);
 * - ArrowUp / ArrowDown:音量 ±0.1(clamp 0-1,输入焦点下豁免,不干扰光标移动);
 * - 仅在快捷键实际命中时 preventDefault / stopPropagation
 *   (旧实现对所有 keyup 无条件阻止,属实现粗糙,此处收敛为命中才阻止)。
 *
 * 系统媒体键由 platform/media-session.ts 负责,此处只处理网页内键盘。
 */
import { playOrPause, setVolume } from "@met/core";
import { useStatusStore } from "@/stores/status";

/** 焦点是否处于可输入区域(INPUT / TEXTAREA / contentEditable) */
const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
};

/** 当前 hash 路由是否为视频播放页(旧实现按路由名 videos-player 豁免空格) */
const isVideosPlayerRoute = (): boolean => {
  const hashPath = window.location.hash.replace(/^#/, "").split("?")[0];
  return hashPath === "/videos-player";
};

/** 处理单次 keyup;返回是否命中快捷键(命中才阻止默认行为) */
const handleShortcut = (e: KeyboardEvent): boolean => {
  // 播放或暂停
  if (e.code === "Space") {
    if (isEditableTarget(e.target)) return false;
    if (isVideosPlayerRoute()) return false;
    void playOrPause();
    return true;
  }

  // 调整音量
  if (e.code === "ArrowUp" || e.code === "ArrowDown") {
    if (isEditableTarget(e.target)) return false;
    const volume = useStatusStore.getState().playVolume;
    const delta = e.code === "ArrowUp" ? 0.1 : -0.1;
    const newVolume = Math.min(1, Math.max(0, volume + delta));
    useStatusStore.setState({ playVolume: newVolume });
    setVolume(newVolume);
    return true;
  }

  return false;
};

/**
 * 挂载全局快捷键监听(keyup,与旧 App.vue 一致)。
 * @returns 清理函数(卸载监听)
 */
export const initGlobalShortcuts = (): (() => void) => {
  const onKeyUp = (e: KeyboardEvent): void => {
    if (handleShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener("keyup", onKeyUp);
  return () => window.removeEventListener("keyup", onKeyUp);
};
