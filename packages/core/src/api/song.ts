import { z } from "zod";
import { request, warnValidate, type ApiResponse } from "./client";

/**
 * 歌曲部分
 */

/** getSongUrl 响应的宽松存在性校验(防后端结构漂移静默炸播放链路) */
const songUrlSchema = z
  .object({
    data: z
      .array(z.object({ url: z.string().nullable().optional() }).loose())
      .optional(),
  })
  .loose();

/** 歌词响应的宽松存在性校验(lrc 等字段为字符串,见 lyrics/parse.ts LyricApiData) */
const songLyricSchema = z
  .object({
    lrc: z.string().nullable().optional(),
    lrctrans: z.string().nullable().optional(),
    qrc: z.string().nullable().optional(),
  })
  .loose();

/** TTML 歌词响应的宽松存在性校验(见 lyrics/parse.ts TtmlLyricData) */
const ttmlLyricSchema = z
  .object({
    content: z.string().nullable().optional(),
  })
  .loose();

/**
 * 获取音乐 URL
 * @param id - 要获取音乐的 ID。
 * @param level - 播放音质等级 / standard: 标准 /  higher: 较高 / exhigh: 极高 / lossless: 无损 / hires: Hi-Res / jyeffect: 高清环绕声 / sky: 沉浸环绕声 / jymaster: 超清母带
 */
export const getSongUrl = async (
  id: number | string,
  level: string = "standard",
): Promise<ApiResponse> => {
  const res = await request("GET", "/song/url/v1", {
    id,
    level,
    timestamp: new Date().getTime(),
  });
  warnValidate(songUrlSchema, res, "getSongUrl");
  return res;
};

/**
 * 获取指定音乐的歌词
 * @param id - 要获取歌词的音乐ID
 */
export const getSongLyric = async (
  id: number | string,
): Promise<ApiResponse> => {
  const res = await request("GET", "/lyric/new", {
    id,
  });
  warnValidate(songLyricSchema, res, "getSongLyric");
  return res;
};

export const getAMttmlLyric = async (
  mid: number | string,
): Promise<ApiResponse> => {
  const res = await request("GET", "/lyric/ttml", {
    mid,
  });
  warnValidate(ttmlLyricSchema, res, "getAMttmlLyric");
  return res;
};
