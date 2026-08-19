import axios, { type ApiResponse } from "./client";

/**
 * 视频
 */

/**
 * 获取指定 MV 的详细信息
 * @param mvid - MV ID
 */
export const getVideoDetail = (mvid: number | string): Promise<ApiResponse> => {
  return axios({
    method: "GET",
    url: "/mv/detail",
    params: {
      mvid,
    },
  });
};

/**
 * 获取指定 MV 的播放地址
 * @param id - 要查询的MV ID
 * @param r - 分辨率。默认值为null
 */
export const getVideoUrl = (
  id: number | string,
  r: string | number | null = null,
): Promise<ApiResponse> => {
  return axios({
    method: "GET",
    hiddenBar: true,
    url: "/mv/url",
    params: {
      id,
      r,
    },
  });
};
