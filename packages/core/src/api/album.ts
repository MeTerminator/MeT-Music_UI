import axios, { type ApiResponse } from "./client";

/**
 * 专辑部分
 */

/**
 * 获取专辑内容
 * @param id - 专辑id
 */
export const getAlbumDetail = (id: number | string): Promise<ApiResponse> => {
  return axios({
    method: "GET",
    url: "/album",
    params: {
      id,
      timestamp: new Date().getTime(),
    },
  });
};
