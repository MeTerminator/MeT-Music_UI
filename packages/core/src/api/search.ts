import axios, { type ApiResponse } from "./client";

/**
 * 搜索部分
 */

/**
 * 热搜列表 - 详细
 */
export const getSearchHot = (): Promise<ApiResponse> => {
  return axios({
    method: "GET",
    url: "/search/hot/detail",
    params: {
      timestamp: new Date().getTime(),
    },
  });
};

/**
 * 搜索建议
 * @param keywords - 搜索关键词
 * @param mobile - 如果传入 true 则返回移动端数据
 */
export const getSearchSuggest = (
  keywords: string,
  mobile: boolean = false,
): Promise<ApiResponse> => {
  return axios({
    method: "GET",
    url: "/search/suggest",
    params: {
      keywords,
      ...(mobile && { type: "mobile" }),
    },
  });
};

/**
 * 搜索结果
 * @param keywords - 搜索关键词
 * @param limit - 返回数量，默认30
 * @param offset - 偏移数量，默认0
 * @param type - 可选参数，搜索类型。1表示单曲，10表示专辑，100表示歌手，1000表示歌单，1002表示用户，1004表示MV，1006表示歌词，1009表示电台，1014表示视频，1018表示综合，2000表示声音。默认为 1
 */
export const getSearchRes = (
  keywords: string,
  limit: number = 50,
  offset: number = 0,
  type: number = 1,
): Promise<ApiResponse> => {
  return axios({
    method: "GET",
    url: "/cloudsearch",
    params: {
      keywords,
      limit,
      offset,
      type,
    },
  });
};
