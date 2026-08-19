// import { getCookie, isLogin } from "@/utils/auth";
import axios from "axios";
import type { AxiosError, AxiosInstance, AxiosResponse } from "axios";

/**
 * 旧代码 (src/utils/request.js) 直接修改 axios.defaults 全局配置;
 * 这里改为独立实例,不再污染全局 axios。
 */

// 自定义请求配置字段(旧代码在 config 上附带的非标准属性)
declare module "axios" {
  export interface AxiosRequestConfig {
    /** 旧代码用于控制顶部加载条的标记(UI 层消费,core 仅透传) */
    hiddenBar?: boolean;
    /** 旧代码用于跳过附加 cookie 的标记 */
    noCookie?: boolean;
  }
}

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

// 全局地址 / 基础配置
export const apiClient: AxiosInstance = axios.create({
  baseURL: "/api/web",
  timeout: 15000,
  withCredentials: true,
});

/** 覆盖 baseURL(供未来非浏览器宿主使用) */
export const setApiBaseURL = (url: string): void => {
  apiClient.defaults.baseURL = url;
};

// 请求拦截
apiClient.interceptors.request.use(
  (request) => {
    if (!request.params) request.params = {};
    // 附加 cookie
    // if (!request.noCookie && (isLogin() || getCookie("MUSIC_U") !== null)) {
    //   request.params.cookie = `MUSIC_U=${getCookie("MUSIC_U")};`;
    // }
    // 去除 cookie
    // if (request.noCookie) {
    //   request.params.noCookie = true;
    // }
    // 发送请求
    return request;
  },
  (error: unknown) => {
    console.error("请求失败，请稍后重试");
    return Promise.reject(error);
  },
);

// 响应拦截
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response?.data;
  },
  (error: AxiosError) => {
    // 从错误对象中获取响应信息
    const response = error.response;
    // 断网处理
    if (!response) {
      if (offlineHandler) offlineHandler(error);
      else console.error("网络连接失败：", error.message);
    }
    // 状态码处理
    switch (response?.status) {
      case 400:
        console.error("客户端错误：", response.status, response.statusText);
        // 执行客户端错误的处理逻辑
        break;
      case 401:
        console.error("未授权：", response.status, response.statusText);
        // 执行未授权的处理逻辑
        break;
      case 403:
        console.error("禁止访问：", response.status, response.statusText);
        // 执行禁止访问的处理逻辑
        break;
      case 404:
        console.error("未找到资源：", response.status, response.statusText);
        // 执行未找到资源的处理逻辑
        break;
      case 500:
        console.error("服务器错误：", response.status, response.statusText);
        // 执行服务器错误的处理逻辑
        break;
      default:
        // 处理其他状态码或错误条件
        console.error("未处理的错误：", error.message);
    }
    // 继续传递错误
    return Promise.reject(error);
  },
);

/**
 * API 响应类型别名。响应结构尚未类型化(后续任务会收紧为各端点的具体类型),
 * 暂以 any 作为唯一的 strict 豁免点集中声明。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiResponse = any;

export default apiClient;
