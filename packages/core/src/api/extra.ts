import axios, { type ApiResponse } from "./client";

export const getMusicUrl = (
  mid: number | string,
  music_quality: string,
): Promise<ApiResponse> => {
  return axios({
    method: "GET",
    url: "/extra/music/url",
    params: {
      mid,
      music_quality,
      timestamp: new Date().getTime(),
    },
  });
};

export const getMusicInfo = (mid: number | string): Promise<ApiResponse> => {
  return axios({
    method: "GET",
    url: "/extra/music/info",
    params: {
      mids: mid,
    },
  });
};

export const getComments = (
  songID: number | string,
  page: number,
  pageSize: number,
  last_seq_no: string | number | undefined,
): Promise<ApiResponse> => {
  return axios({
    method: "GET",
    url: "/extra/music/comments",
    params: {
      songID,
      page,
      pageSize,
      last_seq_no,
    },
  });
};
