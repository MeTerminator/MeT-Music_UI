import type { Platform } from "../types/platform";
import { request } from "./client";
import type { ApiResponseFor } from "./contracts";
import { withLyricCache } from "./lyric-cache";

/**
 * 获取音乐 URL
 * @param id - 要获取音乐的 ID。
 * @param level - 播放音质等级 / standard: 标准 /  higher: 较高 / exhigh: 极高 / lossless: 无损 / hires: Hi-Res / jyeffect: 高清环绕声 / sky: 沉浸环绕声 / jymaster: 超清母带
 */
export const getSongUrl = async (
  id: number | string,
  level: string = "standard",
  platform: Platform = "qq",
  codecs?: readonly string[],
): Promise<ApiResponseFor<"/song/url/v1">> => {
  const res = await request("GET", "/song/url/v1", {
    platform,
    id,
    level,
    audio_api: 2,
    ...(platform === "qq" && codecs ? { codecs: codecs.join(",") } : {}),
    timestamp: new Date().getTime(),
  });
  return res;
};

/**
 * 获取指定音乐的歌词
 * @param id - 要获取歌词的音乐ID
 */
export const getSongLyric = async (
  id: number | string,
  platform: Platform = "qq",
): Promise<ApiResponseFor<"/lyric/new">> => {
  return withLyricCache("/lyric/new", platform, id, () =>
    request("GET", "/lyric/new", {
      platform,
      id,
    }),
  );
};

export const getAMttmlLyric = async (
  mid: number | string,
  platform: Platform = "qq",
): Promise<ApiResponseFor<"/lyric/ttml">> => {
  return withLyricCache("/lyric/ttml", platform, mid, () =>
    request("GET", "/lyric/ttml", {
      platform,
      mid,
    }),
  );
};
