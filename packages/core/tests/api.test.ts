import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeoutError } from "ky";
import { setApiBaseURL, setOfflineHandler } from "../src/api/client";
import { getSongUrl } from "../src/api/song";
import { getSearchRes } from "../src/api/search";

/** 被记录的请求 */
interface RecordedRequest {
  method: string;
  url: URL;
}

const recorded: RecordedRequest[] = [];

/** 可配置的假响应 body */
let nextResponseData: unknown = {};
/** 非 null 时,mock fetch 返回该状态码的错误响应 */
let nextErrorStatus: { status: number; statusText: string } | null = null;
/** 非 null 时,mock fetch 直接 reject(模拟网络层错误) */
let nextNetworkError: Error | null = null;

/** 手写 fetch mock:记录请求并返回可配置的 Response */
const mockFetch = vi.fn(
  async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method =
      (input instanceof Request ? input.method : init?.method) ?? "GET";
    recorded.push({
      method: method.toUpperCase(),
      url: new URL(rawUrl, "http://localhost"),
    });
    if (nextNetworkError) throw nextNetworkError;
    if (nextErrorStatus) {
      return new Response(JSON.stringify({ code: nextErrorStatus.status }), {
        status: nextErrorStatus.status,
        statusText: nextErrorStatus.statusText,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(nextResponseData), {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json" },
    });
  },
);

beforeEach(() => {
  // Node 环境下 fetch/Request 无页面上下文,相对 URL 无法解析;
  // 浏览器中保持默认的相对前缀 /api/web,测试改用绝对地址(顺带覆盖 setApiBaseURL 重建实例)
  setApiBaseURL("http://localhost/api/web");
  recorded.length = 0;
  nextResponseData = {};
  nextErrorStatus = null;
  nextNetworkError = null;
  mockFetch.mockClear();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("api client (ky)", () => {
  it("getSongUrl(1) 发出 GET 请求,URL 含 /api/web/song/url/v1 与 id/level/timestamp 参数", async () => {
    // 消化掉 warnValidate 对空 body 的告警(空对象通过 loose 校验,不应有 warn)
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    nextResponseData = { code: 200, data: [{ url: "https://x/a.mp3" }] };

    await getSongUrl(1);

    expect(recorded).toHaveLength(1);
    const req = recorded[0]!;
    expect(req.method).toBe("GET");
    expect(req.url.pathname).toBe("/api/web/song/url/v1");
    expect(req.url.searchParams.get("id")).toBe("1");
    expect(req.url.searchParams.get("level")).toBe("standard");
    const timestamp = req.url.searchParams.get("timestamp");
    expect(timestamp).not.toBeNull();
    expect(Number.isFinite(Number(timestamp))).toBe(true);
    // 合法结构不应触发结构漂移告警
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("getSearchRes 默认参数 limit=50 / offset=0 / type=1", async () => {
    await getSearchRes("hello");

    expect(recorded).toHaveLength(1);
    const req = recorded[0]!;
    expect(req.method).toBe("GET");
    expect(req.url.pathname).toBe("/api/web/cloudsearch");
    expect(req.url.searchParams.get("keywords")).toBe("hello");
    expect(req.url.searchParams.get("limit")).toBe("50");
    expect(req.url.searchParams.get("offset")).toBe("0");
    expect(req.url.searchParams.get("type")).toBe("1");
  });

  it("JSON body 直接返回(旧 axios 拦截器剥壳语义)", async () => {
    const payload = { code: 200, data: [{ url: "https://example.com/a.mp3" }] };
    nextResponseData = payload;

    const res = await getSongUrl(2, "exhigh");

    expect(res).toEqual(payload);
  });

  it("getSongUrl 响应结构漂移时仅 console.warn,不拦截返回", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const payload = { code: 200, data: "not-an-array" };
    nextResponseData = payload;

    const res = await getSongUrl(3);

    expect(res).toEqual(payload);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]![0])).toContain("getSongUrl");
  });

  it("404 时 reject 且 console.error 未找到资源", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    nextErrorStatus = { status: 404, statusText: "Not Found" };

    await expect(getSearchRes("missing")).rejects.toThrowError();
    expect(errorSpy).toHaveBeenCalledWith("未找到资源：", 404, "Not Found");
  });

  it("fetch TypeError 时调用 offlineHandler 且 reject", async () => {
    const offlineHandler = vi.fn();
    setOfflineHandler(offlineHandler);
    nextNetworkError = new TypeError("Failed to fetch");

    await expect(getSearchRes("offline")).rejects.toThrowError();
    expect(offlineHandler).toHaveBeenCalledTimes(1);
  });

  it("超时(ky TimeoutError)时调用 offlineHandler 且 reject", async () => {
    const offlineHandler = vi.fn();
    setOfflineHandler(offlineHandler);
    // 直接以 ky 导出的 TimeoutError 模拟超时(isTimeoutError 按 instanceof/name 判定)
    nextNetworkError = new TimeoutError(
      new Request("http://localhost/api/web/cloudsearch"),
    );

    await expect(getSearchRes("timeout")).rejects.toThrowError();
    expect(offlineHandler).toHaveBeenCalledTimes(1);
  });
});
