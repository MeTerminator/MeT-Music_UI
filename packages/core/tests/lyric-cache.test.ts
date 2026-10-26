import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureLyricCache, normalizeLyricCacheDays } from "../src/api/lyric-cache";
import { getAMttmlLyric, getSongLyric } from "../src/api/song";
import { request } from "../src/api/client";

vi.mock("../src/api/client", () => ({ request: vi.fn() }));
const mockRequest = vi.mocked(request);
const DAY = 86_400_000;
const lyrics = { code: 200, source: "network", lrc: "[00:01]歌词", lrctrans: "", qrc: "", qrctrans: "", qrcroma: "" } as const;
const ttml = { status: "success", content: "<tt>歌词</tt>" } as const;
let days = 7;
let entries: Map<string, string>;
let storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
  days = 7;
  entries = new Map();
  storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
    removeItem: (key) => { entries.delete(key); },
  };
  configureLyricCache({ getDays: () => days, getStorage: () => storage });
  mockRequest.mockReset();
  mockRequest.mockImplementation(async (_method, path) => path === "/lyric/ttml" ? ttml : lyrics);
});

afterEach(() => {
  configureLyricCache({ getDays: () => 7, getStorage: () => undefined });
  vi.useRealTimers();
});

describe("全局歌词缓存", () => {
  it.each([getSongLyric, getAMttmlLyric])("两种歌词均使用持久缓存，默认七天到期时重新获取", async (getLyric) => {
    const first = await getLyric("song");
    expect(entries.size).toBe(1);
    // 重新装配缓存，模拟页面重新加载；缓存只依赖本地存储。
    configureLyricCache({ getDays: () => days, getStorage: () => storage });
    vi.advanceTimersByTime(7 * DAY - 1);
    expect(await getLyric("song")).toEqual(first);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await getLyric("song");
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("平台、歌曲、歌词类型互相隔离，数字和字符串 ID 共用缓存", async () => {
    await getSongLyric(123, "qq");
    await getSongLyric("123", "qq");
    await getSongLyric(123, "netease");
    await getSongLyric(456, "qq");
    await getAMttmlLyric(123, "qq");
    expect(mockRequest).toHaveBeenCalledTimes(4);
    expect(entries.size).toBe(4);
  });

  it("修改有效期立即生效，支持小数天数和永不过期", async () => {
    await getSongLyric(1);
    vi.advanceTimersByTime(DAY / 2);
    days = 0.5;
    await getSongLyric(1);
    expect(mockRequest).toHaveBeenCalledTimes(2);
    days = -1;
    vi.advanceTimersByTime(10_000 * DAY);
    await getSongLyric(1);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it.each([getSongLyric, getAMttmlLyric])("关闭后不读取或写入缓存", async (getLyric) => {
    await getLyric(1);
    const saved = [...entries];
    days = 0;
    await getLyric(1);
    await getLyric(2);
    expect(mockRequest).toHaveBeenCalledTimes(3);
    expect([...entries]).toEqual(saved);
  });

  it("明确没有 TTML 歌词的结果也缓存，避免重复请求", async () => {
    mockRequest.mockResolvedValue({ status: "no_lyrics" });
    await getAMttmlLyric(1);
    expect(await getAMttmlLyric(1)).toEqual({ status: "no_lyrics" });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it.each(["{", JSON.stringify({ cachedAt: Date.parse("2026-10-26T00:00:00Z"), data: {} })])("损坏缓存回退请求并修复", async (raw) => {
    await getSongLyric(1);
    const key = [...entries.keys()][0];
    entries.set(key, raw);
    expect(await getSongLyric(1)).toEqual(lyrics);
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(JSON.parse(entries.get(key)!).data).toEqual(lyrics);
  });

  it("请求失败不缓存，下次仍可重试", async () => {
    mockRequest.mockRejectedValueOnce(new Error("offline"));
    await expect(getSongLyric(1)).rejects.toThrow("offline");
    expect(entries.size).toBe(0);
    await getSongLyric(1);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("存储不可访问或写满不影响请求结果", async () => {
    configureLyricCache({ getDays: () => days, getStorage: () => { throw new Error("denied"); } });
    expect(await getSongLyric(1)).toEqual(lyrics);
    configureLyricCache({ getDays: () => days, getStorage: () => ({
      ...storage, setItem: () => { throw new Error("quota exceeded"); },
    }) });
    expect(await getAMttmlLyric(1)).toEqual(ttml);
  });

  it("请求中关闭缓存不会继续写入", async () => {
    mockRequest.mockImplementationOnce(async () => { days = 0; return lyrics; });
    await getSongLyric(1);
    expect(entries.size).toBe(0);
  });

  it("非法持久化配置回退默认七天", () => {
    for (const value of [null, undefined, "7", NaN, Infinity, -2]) {
      expect(normalizeLyricCacheDays(value)).toBe(7);
    }
    for (const value of [0, -1, 0.5, 30]) expect(normalizeLyricCacheDays(value)).toBe(value);
  });
});
