/**
 * UI 反馈接口。core 不依赖任何 UI 框架,所有面向用户的提示均通过此接口注入;
 * 未注入时各模块应静默(仅 console)。
 * 对应旧代码中的 $message / $dialog 全局。
 */
export interface Notifier {
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
  error(message: string): void;
  /** 致命错误对话框(对应旧 $dialog.error);action 为用户确认后的回调 */
  fatal?(title: string, content: string, actionText: string, action: () => void): void;
}

/** 静默实现,仅输出到 console */
export const consoleNotifier: Notifier = {
  info: (m) => console.info(m),
  success: (m) => console.info(m),
  warning: (m) => console.warn(m),
  error: (m) => console.error(m),
};
