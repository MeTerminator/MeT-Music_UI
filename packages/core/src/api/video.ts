import type { Platform } from "../types/platform";
import { request } from "./client";
import type { ApiResponseFor } from "./contracts";

/**
 * 视频
 */

/**
 * 获取指定 MV 的详细信息
 * @param mvid - MV ID
 */
export const getVideoDetail = (mvid: number | string, platform: Platform = "qq"): Promise<ApiResponseFor<"/mv/detail">> => {
  return request("GET", "/mv/detail", {
    platform,
    mvid,
  });
};

/**
 * 获取指定 MV 的播放地址
 * @param id - 要查询的MV ID
 * @param r - 分辨率。默认值为null
 */
export const getVideoUrl = (
  id: number | string,
  r: string | number | null = null, platform: Platform = "qq"): Promise<ApiResponseFor<"/mv/url">> => {
  return request("GET", "/mv/url", {
    platform,
    id,
    r,
  });
};
