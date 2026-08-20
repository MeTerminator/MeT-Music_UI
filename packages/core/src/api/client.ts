import ky, { isHTTPError, isNetworkError } from "ky";
import type { KyInstance } from "ky";
import type { z } from "zod";

/**
 * 旧代码 (src/utils/request.js) 直接修改 axios.defaults 全局配置;
 * 迁移历程:全局 axios -> 独立 axios 实例 -> ky(fetch)。
 * 端点函数的返回值语义与 axios 时代完全一致:直接返回 HTTP body 的 JSON
 * (即旧响应拦截器 `response.data` 剥壳后的值)。
 */

/** 断网处理回调。对应旧代码中的全局 $canNotConnect。 */
type OfflineHandler = (error: unknown) => void;

let offlineHandler: OfflineHandler | null = null;

/**
 * 注入断网处理回调(对应旧全局 $canNotConnect)。
 * 未注入时仅 console.error。
 */
export const setOfflineHandler = (fn: OfflineHandler): void => {
  offlineHandler = fn;
};

/** 与旧 axios 实例对齐:baseURL /api/web、timeout 15s、携带凭据、不重试 */
const createClient = (prefix: string): KyInstance =>
  ky.create({
    prefix,
    timeout: 15000,
    credentials: "include",
    retry: 0,
  });

// 全局地址 / 基础配置(live binding:setApiBaseURL 后引用方拿到新实例)
export let apiClient: KyInstance = createClient("/api/web");

/** 覆盖 baseURL(供未来非浏览器宿主使用)。ky 实例不可变,直接重建。 */
export const setApiBaseURL = (url: string): void => {
  apiClient = createClient(url);
};

/**
 * 错误处理,对齐旧 axios 响应拦截器语义:
 * - 网络层错误(fetch TypeError,ky 包装为 NetworkError):调用 offlineHandler,
 *   未注入则 console.error;
 * - 非 2xx(ky HTTPError):按状态码 console.error 对应文案;
 * - 错误始终继续向上抛出(reject)。
 */
const handleError = (error: unknown): never => {
  if (isNetworkError(error) || error instanceof TypeError) {
    if (offlineHandler) offlineHandler(error);
    else
      console.error(
        "网络连接失败：",
        error instanceof Error ? error.message : String(error),
      );
    throw error;
  }
  if (isHTTPError(error)) {
    const { status, statusText } = error.response;
    switch (status) {
      case 400:
        console.error("客户端错误：", status, statusText);
        break;
      case 401:
        console.error("未授权：", status, statusText);
        break;
      case 403:
        console.error("禁止访问：", status, statusText);
        break;
      case 404:
        console.error("未找到资源：", status, statusText);
        break;
      case 500:
        console.error("服务器错误：", status, statusText);
        break;
      default:
        console.error("未处理的错误：", error.message);
    }
    throw error;
  }
  console.error(
    "未处理的错误：",
    error instanceof Error ? error.message : String(error),
  );
  throw error;
};

/**
 * API 响应类型别名。响应结构尚未类型化(后续任务会收紧为各端点的具体类型),
 * 暂以 any 作为唯一的 strict 豁免点集中声明。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiResponse = any;

/** 端点函数可传入的查询参数值;undefined/null 会被过滤(对齐 axios params 序列化) */
type ParamValue = string | number | boolean | null | undefined;

/**
 * 统一请求帮助函数:过滤 undefined/null 参数后发起请求,返回 body 的 JSON。
 * path 的前导 / 会被统一剥去(ky 的 prefix 拼接约定)。
 */
export const request = async (
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD",
  path: string,
  params?: Record<string, ParamValue>,
): Promise<ApiResponse> => {
  const searchParams = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
  }
  try {
    return await apiClient(path.replace(/^\/+/, ""), {
      method,
      searchParams,
    }).json();
  } catch (error) {
    return handleError(error);
  }
};

/**
 * 宽松存在性校验:失败仅 console.warn(带端点名),不拦截返回。
 * 用于关键响应(播放链路)的后端结构漂移预警。
 */
export const warnValidate = (
  schema: z.ZodType,
  value: unknown,
  label: string,
): void => {
  const result = schema.safeParse(value);
  if (!result.success) {
    console.warn(`[api] ${label} 响应结构异常：`, result.error.message);
  }
};
