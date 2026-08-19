import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { apiClient } from "../src/api/client";
import { getSongUrl } from "../src/api/song";
import { getSearchRes } from "../src/api/search";

/** 被记录的请求 */
interface RecordedRequest {
  method: string;
  url: string;
  params: Record<string, unknown>;
}

const recorded: RecordedRequest[] = [];

/** 注入到 apiClient 的自定义 adapter:记录请求并返回可配置的假响应 */
let nextResponseData: unknown = {};

const recordingAdapter = async (config: InternalAxiosRequestConfig) => {
  recorded.push({
    method: (config.method ?? "").toUpperCase(),
    url: config.url ?? "",
    params: (config.params ?? {}) as Record<string, unknown>,
  });
  return {
    data: nextResponseData,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  };
};

let originalAdapter: unknown;

beforeEach(() => {
  recorded.length = 0;
  nextResponseData = {};
  originalAdapter = apiClient.defaults.adapter;
  apiClient.defaults.adapter = recordingAdapter;
});

afterEach(() => {
  apiClient.defaults.adapter =
    originalAdapter as typeof apiClient.defaults.adapter;
});

describe("api client", () => {
  it("getSongUrl(1) 发出 GET /song/url/v1,params 含 id=1、level=standard、数字 timestamp", async () => {
    await getSongUrl(1);

    expect(recorded).toHaveLength(1);
    const req = recorded[0]!;
    expect(req.method).toBe("GET");
    expect(req.url).toBe("/song/url/v1");
    expect(req.params.id).toBe(1);
    expect(req.params.level).toBe("standard");
    expect(typeof req.params.timestamp).toBe("number");
  });

  it("getSearchRes 默认参数 limit=50 / offset=0 / type=1", async () => {
    await getSearchRes("hello");

    expect(recorded).toHaveLength(1);
    const req = recorded[0]!;
    expect(req.method).toBe("GET");
    expect(req.url).toBe("/cloudsearch");
    expect(req.params.keywords).toBe("hello");
    expect(req.params.limit).toBe(50);
    expect(req.params.offset).toBe(0);
    expect(req.params.type).toBe(1);
  });

  it("响应拦截器剥壳:{ data: {...} } 返回内部 data", async () => {
    const payload = { code: 200, data: { url: "https://example.com/a.mp3" } };
    nextResponseData = payload;

    const res = await getSongUrl(2, "exhigh");

    // 拦截器返回 response.data,即 adapter 塞入的 payload 本体
    expect(res).toEqual(payload);
  });
});
