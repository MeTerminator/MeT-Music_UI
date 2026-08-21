import { getSongTime, type Song } from "@met/core";
import { getAssetUrl } from "@/platform/web";

/**
 * 后端原始数据(歌曲/歌单/歌手/专辑/MV/电台等,结构繁杂且随接口变化,
 * 集中豁免为 any;除此文件外不应出现裸 any)。
 */
// biome-ignore / eslint 豁免:原始接口数据无稳定 schema
type RawData = any;

/** 支持的格式化类型 */
export type FormatType = "playlist" | "song" | "artist" | "album" | "mv" | "dj";

/**
 * 格式化原始数据(移植自旧 src/utils/formatData.js,逻辑保持一致)
 * @param data - 必选参数,输入的原始数据(单个对象或数组)
 * @param type - 必选参数,格式化的类型
 * @param noTracks - 歌单类型时是否丢弃 tracks
 * @returns 根据 type 参数生成的列表数据(输入为空时返回 null)
 */
const formatData = (
  data: RawData,
  type: FormatType = "playlist",
  noTracks = false,
): Song[] | null => {
  if (!data) return null;
  // 若传入的是单个数据对象,转为数组
  const dataArray: RawData[] = Array.isArray(data) ? data : [data];
  // 遍历
  return dataArray.map((raw: RawData) => {
    let v: RawData = raw;
    // 特殊处理(云盘 songInfo / 简化 simpleSong)
    if (type === "song") {
      if (v?.songInfo) v = v.songInfo;
      else if (v?.simpleSong) v = v.simpleSong;
    }
    // 封面处理
    const imgUrl =
      v &&
      (v.picUrl ||
        v.coverUrl ||
        v.coverImgUrl ||
        v.imgurl ||
        v.cover ||
        (v.album && v.album.picUrl) ||
        (v.al && (v.al.picUrl || v.al.xInfo?.picUrl)));
    const cover = getCoverUrl(imgUrl);
    const coverSize = {
      s: getCoverUrl(imgUrl, 300),
      m: getCoverUrl(imgUrl, 500),
      l: getCoverUrl(imgUrl, 800),
      xl: getCoverUrl(imgUrl, 800),
    };
    // 类型判断
    switch (type) {
      // 歌单
      case "playlist":
        return {
          id: v.id,
          name: v.name,
          cover,
          coverSize,
          count: v.trackCount,
          creator: v.creator || v.updateFrequency,
          tracks: noTracks ? null : v.tracks,
          playCount: v.playCount,
          createTime: v.createTime,
          updateTime: v.updateTime || v.trackNumberUpdateTime,
          description: v.description,
          tags: v.tags || v.algTags,
          userId: v.userId,
        };
      // 歌曲
      case "song":
        return {
          id: v.id,
          name: v.name,
          artists: v.artists || v.ar,
          album: v.album || v.al,
          cover,
          coverSize,
          mv: v.mv,
          alia: v.alia?.[0] || v.alias?.[0] || v.transNames?.[0],
          fee: v.fee,
          pc: v.pc,
          size: v.size,
          ttml: v?.ttml,
          duration: getSongTime(v.duration || v.dt),
        };
      // 歌手
      case "artist":
        return {
          id: v.id,
          name: v.name,
          description: v.briefDesc,
          cover,
          coverSize,
          alias: v.alias,
          size: {
            music: v.musicSize,
            album: v.albumSize,
            mv: v.mvSize,
            fans: v.fansCount,
          },
        };
      // 专辑
      case "album":
        return {
          id: v.id,
          name: v.name,
          alia: v.alias?.[0],
          cover,
          coverSize,
          artists: v.artists,
          description: v.description,
          publishTime: v.publishTime,
          tags: v.tags || v.algTags,
          count: v.size,
          share: v.info?.shareCount,
        };
      // mv
      case "mv":
        return {
          id: v.id || v.vid,
          name: v.name || v.title,
          artists: v.artists || v.creator,
          desc: v.copywriter,
          cover,
          coverSize: getCoverUrl(cover, "464y260"),
          duration: v.duration || v.durationms,
          playCount: v.playCount || v.playTime,
        };
      // dj
      case "dj":
        return {
          id: v.mainTrackId || v.id || v.vid,
          name: v.name,
          creator: v.dj,
          count: v.programCount,
          desc: v.copywriter || v.lastProgramName || v.desc,
          cover,
          coverSize,
          tags: { id: v.categoryId, name: v.category },
          rcmdText: v.rcmdtext || v.rcmdText,
          playCount: v.playCount || v.listenerCount,
          createTime: v.createTime,
          updateTime: v.lastProgramCreateTime || v.scheduledPublishTime,
          duration: getSongTime(v.duration),
        };
      default:
        return null;
    }
  }) as Song[];
};

/**
 * 获取图片的 url(与旧实现一致)
 * @param url - 必选参数,输入的原始图片 url
 * @param size - 可选参数,需要生成的图片尺寸,默认为 500(mv 场景传入 "464y260" 字符串)
 * @returns 根据 url 和 size 参数生成的图片 url
 */
export const getCoverUrl = (url: RawData, size: number | string = 500): string => {
  try {
    if (!url) return getAssetUrl("/images/pic/song.jpg?assest");
    const imageUrl = String(url).replace(/^http:/, "https:");
    return imageUrl.replace("500x500", `${size}x${size}`);
  } catch (error) {
    console.error("图片链接处理出错：", error);
    return getAssetUrl("/images/pic/song.jpg?assest");
  }
};

export default formatData;
