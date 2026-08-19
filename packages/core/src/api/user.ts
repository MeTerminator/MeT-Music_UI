import axios, { type ApiResponse } from "./client";

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
  offset: number = 0,
): Promise<ApiResponse> => {
  return axios({
    method: "GET",
    url: "/user/playlist",
    params: {
      uid,
      limit,
      offset,
      timestamp: new Date().getTime(),
    },
  });
};
