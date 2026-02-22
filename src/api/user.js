import axios from "@/utils/request";

/**
 * 用户部分
 */


/**
 * 获取用户的歌单列表
 * @param {string} uid 用户的id
 * @param {number} [limit=30] - 返回数量，默认30
 * @param {number} [offset=0] - 偏移数量，默认0
 */
export const getUserPlaylist = (uid, limit = 30, offset = 0) => {
  return axios({
    method: "GET",
    url: "/user/playlist",
    params: {
      uid,
      limit,
      offset,
      timestamp: new Date().getTime(),
    },
  });
};


