import type { Platform } from "../types/platform";
import { request } from "./client";
import type { ApiResponseFor } from "./contracts";

/**
 * 歌手部分
 */

/**
 * 获取歌手详情
 * @param id - 歌手id
 */
export const getArtistDetail = (id: number | string, platform: Platform = "qq"): Promise<ApiResponseFor<"/artist/detail">> => {
  return request("GET", "/artist/detail", {
    platform,
    id,
  });
};

/**
 * 获取歌手部分信息和热门歌曲
 * @param id - 歌手id
 */
export const getArtistSongs = (id: number | string, platform: Platform = "qq"): Promise<ApiResponseFor<"/artists">> => {
  return request("GET", "/artists", {
    platform,
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
  order: string = "hot", platform: Platform = "qq"): Promise<ApiResponseFor<"/artist/songs">> => {
  return request("GET", "/artist/songs", {
    platform,
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
  offset: number = 0, platform: Platform = "qq"): Promise<ApiResponseFor<"/artist/album">> => {
  return request("GET", "/artist/album", {
    platform,
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
  offset: number = 0, platform: Platform = "qq"): Promise<ApiResponseFor<"/artist/mv">> => {
  return request("GET", "/artist/mv", {
    platform,
    id,
    limit,
    offset,
  });
};
