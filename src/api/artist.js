import axios from "@/utils/request";

/**
 * 歌手部分
 */



/**
 * 获取歌手详情
 * @param {number} id - 歌手id
 */
export const getArtistDetail = (id) => {
  return axios({
    method: "GET",
    url: "/artist/detail",
    params: {
      id,
    },
  });
};

/**
 * 获取歌手部分信息和热门歌曲
 * @param {number} id - 歌手id
 */
export const getArtistSongs = (id) => {
  return axios({
    method: "GET",
    url: "/artists",
    params: {
      id,
      timestamp: new Date().getTime(),
    },
  });
};

/**
 * 获取歌手全部歌曲
 * @param {number} id - 歌手id
 * @param {number} [limit=50] - 返回数量，默认50
 * @param {number} [offset=0] - 偏移数量，默认0
 * @param {string} order - hot: 热门, time: 时间
 */
export const getArtistAllSongs = (id, limit = 50, offset = 0, order = "hot") => {
  return axios({
    method: "GET",
    url: "/artist/songs",
    params: {
      id,
      limit,
      offset,
      order,
      timestamp: new Date().getTime(),
    },
  });
};

/**
 * 获取歌手专辑
 * @param {number} id - 歌手id
 * @param {number} [limit=50] - 返回数量，默认50
 * @param {number} [offset=0] - 偏移数量，默认0
 */
export const getArtistAblums = (id, limit = 50, offset = 0) => {
  return axios({
    method: "GET",
    url: "/artist/album",
    params: {
      id,
      limit,
      offset,
    },
  });
};

/**
 * 获取歌手视频
 * @param {number} id - 歌手id
 * @param {number} [limit=50] - 返回数量，默认50
 * @param {number} [offset=0] - 偏移数量，默认0
 */
export const getArtistVideos = (id, limit = 50, offset = 0) => {
  return axios({
    method: "GET",
    url: "/artist/mv",
    params: {
      id,
      limit,
      offset,
    },
  });
};

