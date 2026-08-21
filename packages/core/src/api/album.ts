import { request, type ApiResponse } from "./client";

/**
 * 专辑部分
 */

/**
 * 获取专辑内容
 * @param id - 专辑id
 */
export const getAlbumDetail = (id: number | string): Promise<ApiResponse> => {
  return request("GET", "/album", {
    id,
    timestamp: new Date().getTime(),
  });
};
