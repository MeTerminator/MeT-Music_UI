import axios from "@/utils/request";

/**
 * 歌单部分
 */


/**
 * 获取歌单详情
 * @param {number} id - 歌单 id
 */
export const getPlayListDetail = (id) => {
  return axios({
    method: "GET",
    url: "/playlist/detail",
    params: {
      id,
      timestamp: new Date().getTime(),
    },
  });
};

/**
 * 获取歌单中所有歌曲信息
 * @param {number} id - 歌单id
 * @param {number} [limit=30] - 返回数量，默认30
 * @param {number} [offset=0] - 偏移数量，默认0
 */
export const getAllPlayList = (id, limit = 30, offset = 0) => {
  return axios({
    method: "GET",
    url: "/playlist/track/all",
    params: {
      id,
      limit,
      offset,
      timestamp: new Date().getTime(),
    },
  });
};

