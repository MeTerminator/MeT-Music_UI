import type { Platform } from "../types/platform";
import { request } from "./client";
import type { ApiResponseFor } from "./contracts";

/**
 * 专辑部分
 */

/**
 * 获取专辑内容
 * @param id - 专辑id
 */
export const getAlbumDetail = (id: number | string, platform: Platform = "qq"): Promise<ApiResponseFor<"/album">> => {
  return request("GET", "/album", {
    platform,
    id,
    timestamp: new Date().getTime(),
  });
};
