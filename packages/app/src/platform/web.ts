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

/** 扩展名 → 音频 MIME(CDN 返回 application/octet-stream 时据此纠正) */
const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  webm: "audio/webm",
};

/**
 * 决定 Blob 的 MIME 类型。
 * 音频 Blob 的 type 直接决定 <audio> 能否播放,CDN 常返回
 * application/octet-stream,此时按原始直链的扩展名纠正,兜底 audio/mpeg。
 */
const resolveAudioMime = (response: Response, url: string): string => {
  const headerType = (response.headers.get("content-type") || "").split(";")[0].trim();
  if (headerType.startsWith("audio/")) return headerType;
  const path = url.split(/[?#]/)[0];
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return AUDIO_MIME[ext] || "audio/mpeg";
};

/**
 * 流式读取响应体并按 Content-Length 汇报下载百分比。
 * 无 onProgress / 无 body 流时退回一次性读取;
 * 无 Content-Length 时无法算百分比,仅在读完时汇报 100。
 */
const readBlobWithProgress = async (
  response: Response,
  type: string,
  onProgress: (percent: number) => void,
): Promise<Blob> => {
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body) return new Blob([await response.arrayBuffer()], { type });

  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  let lastPercent = 0;
  onProgress(0);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value as unknown as BlobPart);
    loaded += value.byteLength;
    if (total > 0) {
      // 仅在整数百分比变化时回调,避免每个数据块都触发一次状态更新
      const percent = Math.min(99, Math.floor((loaded / total) * 100));
      if (percent !== lastPercent) {
        lastPercent = percent;
        onProgress(percent);
      }
    }
  }
  onProgress(100);
  return new Blob(chunks, { type });
};

/**
 * 获取音频文件的 Blob 链接(旧 helper.getBlobUrlFromUrl)。
 * onProgress 汇报下载进度(0-100),供播放器把进度条临时用作下载进度显示。
 */
export const getBlobUrlFromUrl = async (
  url: string,
  onProgress?: (percent: number) => void,
): Promise<string> => {
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
    const type = resolveAudioMime(response, url);
    const blob = onProgress
      ? await readBlobWithProgress(response, type, onProgress)
      : new Blob([await response.arrayBuffer()], { type });
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
