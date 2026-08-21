import { request, type ApiResponse } from "./client";

export const getMusicUrl = (
  mid: number | string,
  music_quality: string,
): Promise<ApiResponse> => {
  return request("GET", "/extra/music/url", {
    mid,
    music_quality,
    timestamp: new Date().getTime(),
  });
};

export const getMusicInfo = (mid: number | string): Promise<ApiResponse> => {
  return request("GET", "/extra/music/info", {
    mids: mid,
  });
};

export const getComments = (
  songID: number | string,
  page: number,
  pageSize: number,
  last_seq_no: string | number | undefined,
): Promise<ApiResponse> => {
  return request("GET", "/extra/music/comments", {
    songID,
    page,
    pageSize,
    last_seq_no,
  });
};
