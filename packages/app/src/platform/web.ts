/**
 * Web 平台能力(浏览器 API 封装)。
 * 移植自旧 src/utils/helper.js 中依赖运行环境的部分与 main.js 的 $cleanAll。
 */

// BlobUrl(旧 helper.js 模块级缓存)
let lastSongBlobUrl: string | null = null;

/** sessionId 生成和缓存(旧 helper.getSessionId) */
export const getSessionId = (): string => {
  let sessionId = localStorage.getItem("sessionId");
  if (!sessionId) {
    sessionId = crypto.randomUUID?.() || Math.random().toString(36).substring(2) + Date.now();
    localStorage.setItem("sessionId", sessionId);
  }
  return sessionId;
};

/** 获取音频文件的 Blob 链接(旧 helper.getBlobUrlFromUrl) */
export const getBlobUrlFromUrl = async (url: string): Promise<string> => {
  try {
    // 清理过期的 Blob 链接
    if (lastSongBlobUrl) URL.revokeObjectURL(lastSongBlobUrl);
    // 是否为网络链接
    if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("blob:")) {
      return url;
    }
    // 获取音频文件数据
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`获取音频资源失败：${response.statusText}`);
    }
    const blob = await response.blob();
    // 转换为本地 Blob 链接
    lastSongBlobUrl = URL.createObjectURL(blob);
    return lastSongBlobUrl;
  } catch (error) {
    console.error("获取 Blob 链接遇到错误：" + error);
    throw error;
  }
};

/** 转换静态资源路径,支持 Vite 的 base 配置(旧 helper.getAssetUrl) */
export const getAssetUrl = (path: string): string => {
  if (!path) return "";
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("blob:") ||
    path.startsWith("data:")
  ) {
    return path;
  }
  const base = import.meta.env.BASE_URL || "/";
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const cleanBase = base.endsWith("/") ? base : base + "/";
  return cleanBase + cleanPath;
};

/** 程序重置(旧 main.js 的 window.$cleanAll) */
export const cleanAll = (tip = true): string | false => {
  if (tip) {
    const isConfirmed = window.confirm("确认要重置该站点吗？");
    if (!isConfirmed) return false;
  }
  // 清除 localStorage
  localStorage.clear();
  // 清除 IndexedDB 数据库
  indexedDB.deleteDatabase("filesDB");
  // 清除所有 Cookie
  document.cookie.split(";").forEach((cookie) => {
    const eqPos = cookie.indexOf("=");
    const name = eqPos > -1 ? cookie.substring(0, eqPos) : cookie;
    document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });
  // 清除缓存
  if (typeof caches !== "undefined") {
    caches.keys().then((names) => {
      for (const name of names) caches.delete(name);
    });
  }
  return "已重置应用，请刷新页面";
};
