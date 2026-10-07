import type { Platform } from "../types/platform";
import { request } from "./client";
import type { ApiResponseFor } from "./contracts";

export const getMusicUrl = (
  mid: number | string,
  music_quality: string, platform: Platform = "qq"): Promise<ApiResponseFor<"/extra/music/url">> => {
  return request("GET", "/extra/music/url", {
    platform,
    mid,
    music_quality,
    timestamp: new Date().getTime(),
  });
};

export const getMusicInfo = (mid: number | string, platform: Platform = "qq"): Promise<ApiResponseFor<"/extra/music/info">> => {
  return request("GET", "/extra/music/info", {
    platform,
    mids: mid,
  });
};

export const getComments = (
  songID: number | string,
  page: number,
  pageSize: number,
  last_seq_no: string | number | undefined, platform: Platform = "qq"): Promise<ApiResponseFor<"/extra/music/comments">> => {
  return request("GET", "/extra/music/comments", {
    platform,
    songID,
    page,
    pageSize,
    last_seq_no,
  });
};
