/**
 * 最小 process 声明:app 包未安装 @types/node,测试仅读取环境变量开关
 * (E2E_OFFLINE / E2E_NETWORK)。若日后引入 @types/node,请删除本文件。
 */
declare const process: { env: Record<string, string | undefined> };
