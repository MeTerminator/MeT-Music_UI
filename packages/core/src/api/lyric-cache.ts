import { responseSchemas, type ApiResponseFor } from "./contracts";
import type { Platform } from "../types/platform";

type LyricPath = "/lyric/new" | "/lyric/ttml";
type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const DEFAULT_LYRIC_CACHE_DAYS = 7;
const DAY_MS = 86_400_000;

/** 0 不缓存，-1 永不过期，正数为天数（支持小数）。 */
export function normalizeLyricCacheDays(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && (value >= 0 || value === -1)
    ? value : DEFAULT_LYRIC_CACHE_DAYS;
}

let getDays = () => DEFAULT_LYRIC_CACHE_DAYS;
let getStorage: () => CacheStorage | undefined = () => undefined;

/** 由宿主注入存储及实时设置，core 不直接访问浏览器全局对象。 */
export function configureLyricCache(options: {
  getDays: () => number;
  getStorage: () => CacheStorage | undefined;
}): void {
  getDays = options.getDays;
  getStorage = options.getStorage;
}

export async function withLyricCache<P extends LyricPath>(
  path: P,
  platform: Platform,
  id: string | number,
  fetcher: () => Promise<ApiResponseFor<P>>,
): Promise<ApiResponseFor<P>> {
  const days = normalizeLyricCacheDays(getDays());
  if (days === 0) return fetcher();
  const key = `met:lyric-cache:v1:${platform}:${path}:${encodeURIComponent(String(id))}`;
  let storage: CacheStorage | undefined;
  try {
    storage = getStorage();
    const raw = storage?.getItem(key);
    if (raw) {
      const entry = JSON.parse(raw);
      const age = Date.now() - entry?.cachedAt;
      if (typeof entry?.cachedAt === "number" && Number.isFinite(entry.cachedAt)
        && age >= 0 && (days === -1 || age < days * DAY_MS)) {
        const parsed = responseSchemas[path].safeParse(entry.data);
        if (parsed.success) return parsed.data as ApiResponseFor<P>;
      }
      storage?.removeItem(key);
    }
  } catch {
    // 损坏数据、隐私模式或存储不可用时继续正常请求。
  }

  const data = await fetcher();
  try {
    // 请求期间可能关闭缓存；失败的请求不会走到这里。
    if (normalizeLyricCacheDays(getDays()) !== 0) {
      storage?.setItem(key, JSON.stringify({ cachedAt: Date.now(), data }));
    }
  } catch {
    // localStorage 空间不足不能影响歌词展示。
  }
  return data;
}
