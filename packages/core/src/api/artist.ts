import { request, type ApiResponse } from "./client";

/**
 * 歌手部分
 */

/**
 * 获取歌手详情
 * @param id - 歌手id
 */
export const getArtistDetail = (id: number | string): Promise<ApiResponse> => {
  return request("GET", "/artist/detail", {
    id,
  });
};

/**
 * 获取歌手部分信息和热门歌曲
 * @param id - 歌手id
 */
export const getArtistSongs = (id: number | string): Promise<ApiResponse> => {
  return request("GET", "/artists", {
    id,
    timestamp: new Date().getTime(),
  });
};

/**
 * 获取歌手全部歌曲
 * @param id - 歌手id
 * @param limit - 返回数量，默认50
 * @param offset - 偏移数量，默认0
 * @param order - hot: 热门, time: 时间
 */
export const getArtistAllSongs = (
  id: number | string,
  limit: number = 50,
  offset: number = 0,
  order: string = "hot",
): Promise<ApiResponse> => {
  return request("GET", "/artist/songs", {
    id,
    limit,
    offset,
    order,
    timestamp: new Date().getTime(),
  });
};

/**
 * 获取歌手专辑
 * @param id - 歌手id
 * @param limit - 返回数量，默认50
 * @param offset - 偏移数量，默认0
 */
export const getArtistAblums = (
  id: number | string,
  limit: number = 50,
  offset: number = 0,
): Promise<ApiResponse> => {
  return request("GET", "/artist/album", {
    id,
    limit,
    offset,
  });
};

/**
 * 获取歌手视频
 * @param id - 歌手id
 * @param limit - 返回数量，默认50
 * @param offset - 偏移数量，默认0
 */
export const getArtistVideos = (
  id: number | string,
  limit: number = 50,
  offset: number = 0,
): Promise<ApiResponse> => {
  return request("GET", "/artist/mv", {
    id,
    limit,
    offset,
  });
};
