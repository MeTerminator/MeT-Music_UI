import axios from "@/utils/request";

/**
 * 视频
 */

/**
 * 获取指定 MV 的详细信息
 * @param {number} mvid - MV ID
 */
export const getVideoDetail = (mvid) => {
  return axios({
    method: "GET",
    url: "/mv/detail",
    params: {
      mvid,
    },
  });
};


/**
 * 获取指定 MV 的播放地址
 * @param {number} id - 要查询的MV ID
 * @param {string} [r=null] - 分辨率。默认值为null
 */
export const getVideoUrl = (id, r = null) => {
  return axios({
    method: "GET",
    hiddenBar: true,
    url: "/mv/url",
    params: {
      id,
      r,
    },
  });
};
