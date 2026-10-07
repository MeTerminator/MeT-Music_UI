import type { Platform } from "../types/platform";
import { request } from "./client";
import type { ApiResponseFor } from "./contracts";

/**
 * 用户部分
 */

/**
 * 获取用户的歌单列表
 * @param uid 用户的id
 * @param limit - 返回数量，默认30
 * @param offset - 偏移数量，默认0
 */
export const getUserPlaylist = (
  uid: number | string,
  limit: number = 30,
  offset: number = 0, platform: Platform = "qq"): Promise<ApiResponseFor<"/user/playlist">> => {
  return request("GET", "/user/playlist", {
    platform,
    uid,
    limit,
    offset,
    timestamp: new Date().getTime(),
  });
};
