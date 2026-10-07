import type { Platform } from "../types/platform";
import { request } from "./client";
import type { ApiResponseFor } from "./contracts";

/**
 * 获取音乐 URL
 * @param id - 要获取音乐的 ID。
 * @param level - 播放音质等级 / standard: 标准 /  higher: 较高 / exhigh: 极高 / lossless: 无损 / hires: Hi-Res / jyeffect: 高清环绕声 / sky: 沉浸环绕声 / jymaster: 超清母带
 */
export const getSongUrl = async (
  id: number | string,
  level: string = "standard", platform: Platform = "qq"): Promise<ApiResponseFor<"/song/url/v1">> => {
  const res = await request("GET", "/song/url/v1", {
    platform,
    id,
    level,
    timestamp: new Date().getTime(),
  });
  return res;
};

/**
 * 获取指定音乐的歌词
 * @param id - 要获取歌词的音乐ID
 */
export const getSongLyric = async (
  id: number | string, platform: Platform = "qq"): Promise<ApiResponseFor<"/lyric/new">> => {
  const res = await request("GET", "/lyric/new", {
    platform,
    id,
  });
  return res;
};

export const getAMttmlLyric = async (
  mid: number | string, platform: Platform = "qq"): Promise<ApiResponseFor<"/lyric/ttml">> => {
  const res = await request("GET", "/lyric/ttml", {
    platform,
    mid,
  });
  return res;
};
