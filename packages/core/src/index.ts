/**
 * @met/core 公共入口。
 * 框架无关:禁止引入 React/Vue/Pinia;DOM 访问仅限注入接口(见 player/deps.ts)。
 */
export * from "./types/song";
export * from "./types/notify";

export * from "./lib/time";
export * from "./lib/format";

export * from "./lyrics/parse";
export * from "./lyrics/word-progress";

export * as api from "./api/index";

export * from "./listen-together/types";
export * from "./listen-together/sync";
export * from "./listen-together/client";

export * from "./player/deps";
export * from "./player/engine";
