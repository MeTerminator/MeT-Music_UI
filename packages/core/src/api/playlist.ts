import axios, { type ApiResponse } from "./client";

/**
 * 歌单部分
 */

/**
 * 获取歌单详情
 * @param id - 歌单 id
 */
export const getPlayListDetail = (id: number | string): Promise<ApiResponse> => {
  return axios({
    method: "GET",
    url: "/playlist/detail",
    params: {
      id,
      timestamp: new Date().getTime(),
    },
  });
};

/**
 * 获取歌单中所有歌曲信息
 * @param id - 歌单id
 * @param limit - 返回数量，默认30
 * @param offset - 偏移数量，默认0
 */
export const getAllPlayList = (
  id: number | string,
  limit: number = 30,
  offset: number = 0,
): Promise<ApiResponse> => {
  return axios({
    method: "GET",
    url: "/playlist/track/all",
    params: {
      id,
      limit,
      offset,
      timestamp: new Date().getTime(),
    },
  });
};
