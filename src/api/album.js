import axios from "@/utils/request";

/**
 * 专辑部分
 */

/**
 * 获取专辑内容
 * @param {number} id - 专辑id
 */
export const getAlbumDetail = (id) => {
  return axios({
    method: "GET",
    url: "/album",
    params: {
      id,
      timestamp: new Date().getTime(),
    },
  });
};

