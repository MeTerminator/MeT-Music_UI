import axios from "@/utils/request";

/**
 * 歌曲部分
 */



/**
 * 获取音乐 URL
 * @param {number} id - 要获取音乐的 ID。
 * @param {string} [level=standard] - 播放音质等级 / standard: 标准 /  higher: 较高 / exhigh: 极高 / lossless: 无损 / hires: Hi-Res / jyeffect: 高清环绕声 / sky: 沉浸环绕声 / jymaster: 超清母带
 */
export const getSongUrl = (id, level = "standard") => {
  return axios({
    method: "GET",
    url: "/song/url/v1",
    params: {
      id,
      level,
      timestamp: new Date().getTime(),
    },
  });
};

/**
 * 获取指定音乐的歌词
 * @param {number} id - 要获取歌词的音乐ID
 */
export const getSongLyric = (id) => {
  return axios({
    method: "GET",
    url: "/lyric/new",
    params: {
      id,
    },
  });
};

export const getAMttmlLyric = (mid) => {
  return axios({
    method: "GET",
    url: "/lyric/ttml",
    params: {
      mid,
    },
  });
};

