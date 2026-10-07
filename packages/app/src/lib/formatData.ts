import { getSongTime, type Song } from "@met/core";
import { getAssetUrl } from "@/platform/web";

/** Supported legacy display fields. API responses are validated before formatting. */
interface RawArtist {
  id?: string | number | null;
  name?: string | null;
  mid?: string | null;
  title?: string | null;
  userName?: string | null;
}
interface RawCreator {
  nickname?: string | null;
  userId?: string | number | null;
  avatarUrl?: string | null;
}
interface RawAlbum { id?: string | number | null; name?: string | null; picUrl?: string | null; xInfo?: { picUrl?: string | null } }
interface RawData {
  id?: string | number | null;
  name?: string | null;
  songInfo?: RawData;
  simpleSong?: RawData;
  source?: Song["source"] | null;
  picUrl?: string | null; coverUrl?: string | null; coverImgUrl?: string | null; imgurl?: string | null; cover?: string | null;
  album?: RawAlbum | string | null; al?: RawAlbum | null;
  artists?: RawArtist[] | string | null; ar?: RawArtist[] | null;
  creator?: RawCreator | string | RawArtist[] | null;
  trackCount?: number | null; updateFrequency?: string; tracks?: RawData[] | null;
  playCount?: number | null; createTime?: number | null; updateTime?: number | null; trackNumberUpdateTime?: number;
  description?: string | null; tags?: Song["tags"] | null; algTags?: string[]; userId?: string | number | null;
  mv?: string | number | null; alia?: string | string[] | null; alias?: string[] | null; transNames?: string[];
  fee?: number; pc?: boolean; size?: Song["size"] | null; ttml?: 0 | 1;
  duration?: string | number | null; dt?: number; briefDesc?: string | null;
  musicSize?: number | null; albumSize?: number | null; mvSize?: number | null; fansCount?: number;
  publishTime?: string | number | null; info?: { shareCount?: number }; vid?: string;
  title?: string | null; copywriter?: string; durationms?: number; playTime?: number;
  mainTrackId?: string | number; dj?: RawCreator; programCount?: number;
  lastProgramName?: string; desc?: string | null; categoryId?: number; category?: string;
  rcmdtext?: string; rcmdText?: string; listenerCount?: number;
  lastProgramCreateTime?: number; scheduledPublishTime?: number;
}
const artists = (values: RawArtist[] | string | null | undefined): Song["artists"] =>
  typeof values === "string" ? values : values?.map(a => ({ id: a.id ?? undefined, name: a.name || a.title || a.userName || "未知歌手" }));
const creator = (value: RawCreator | string | RawArtist[] | null | undefined): Song["creator"] =>
  typeof value === "string" ? value : value && !Array.isArray(value) ? { nickname: value.nickname ?? undefined, userId: value.userId ?? undefined, avatarUrl: value.avatarUrl ?? undefined } : undefined;
const album = (value: RawAlbum | string | null | undefined): Song["album"] =>
  typeof value === "string" ? value : value ? { id: value.id ?? undefined, name: value.name || "未知专辑" } : undefined;

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
  data: RawData | RawData[] | null | undefined,
  type: FormatType = "playlist",
  noTracks = false,
): Song[] | null => {
  if (!data) return null;
  // 若传入的是单个数据对象,转为数组
  const dataArray: RawData[] = Array.isArray(data) ? data : [data];
  // 遍历
  return dataArray.map((raw: RawData): Song | null => {
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
        (typeof v.album === "object" && v.album?.picUrl) ||
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
          source: v.source ?? "qqmusic",
          id: v.id ?? "",
          name: v.name ?? "",
          cover,
          coverSize,
          count: v.trackCount ?? undefined,
          creator: creator(v.creator) || v.updateFrequency,
          tracks: noTracks ? null : formatData(v.tracks, "song"),
          playCount: v.playCount ?? undefined,
          createTime: v.createTime ?? undefined,
          updateTime: v.updateTime || v.trackNumberUpdateTime,
          description: v.description ?? undefined,
          tags: v.tags || v.algTags || undefined,
          userId: v.userId ?? undefined,
        };
      // 歌曲
      case "song":
        return {
          source: v.source ?? "qqmusic",
          id: v.id ?? "",
          name: v.name ?? "",
          artists: artists(v.artists || v.ar),
          album: album(v.album || v.al),
          cover,
          coverSize,
          mv: v.mv,
          alia: (typeof v.alia === "string" ? v.alia : v.alia?.[0]) || v.alias?.[0] || v.transNames?.[0],
          fee: v.fee,
          pc: v.pc,
          size: v.size ?? undefined,
          ttml: v?.ttml,
          duration: typeof v.duration === "string" ? v.duration : getSongTime(v.duration || v.dt || 0),
        };
      // 歌手
      case "artist":
        return {
          source: v.source ?? "qqmusic",
          id: v.id ?? "",
          name: v.name ?? "",
          description: v.briefDesc ?? undefined,
          cover,
          coverSize,
          alias: v.alias ?? undefined,
          size: {
            music: v.musicSize ?? undefined,
            album: v.albumSize ?? undefined,
            mv: v.mvSize ?? undefined,
            fans: v.fansCount,
          },
        };
      // 专辑
      case "album":
        return {
          source: v.source ?? "qqmusic",
          id: v.id ?? "",
          name: v.name ?? "",
          alia: v.alias?.[0],
          cover,
          coverSize,
          artists: artists(v.artists),
          description: v.description ?? undefined,
          publishTime: v.publishTime ?? undefined,
          tags: v.tags || v.algTags || undefined,
          count: typeof v.size === "number" ? v.size : undefined,
          share: v.info?.shareCount,
        };
      // mv
      case "mv":
        return {
          source: v.source ?? "qqmusic",
          id: v.id || v.vid || "",
          name: v.name || v.title || "",
          artists: artists(v.artists || (Array.isArray(v.creator) ? v.creator : undefined)),
          desc: v.copywriter,
          cover,
          coverSize: { s: getCoverUrl(cover, "464y260"), m: getCoverUrl(cover, "464y260"), l: getCoverUrl(cover, "464y260") },
          duration: v.duration || v.durationms,
          playCount: v.playCount || v.playTime,
        };
      // dj
      case "dj":
        return {
          source: v.source ?? "qqmusic",
          id: v.mainTrackId || v.id || v.vid || "",
          name: v.name ?? "",
          creator: creator(v.dj),
          count: v.programCount,
          desc: v.copywriter || v.lastProgramName || v.desc || undefined,
          cover,
          coverSize,
          tags: { id: v.categoryId ?? 0, name: v.category ?? "" },
          rcmdText: v.rcmdtext || v.rcmdText,
          playCount: v.playCount || v.listenerCount,
          createTime: v.createTime ?? undefined,
          updateTime: v.lastProgramCreateTime || v.scheduledPublishTime,
          duration: typeof v.duration === "string" ? v.duration : getSongTime(v.duration || 0),
        };
      default:
        return null;
    }
  }).filter((item): item is Song => item !== null);
};

/**
 * 获取图片的 url(与旧实现一致)
 * @param url - 必选参数,输入的原始图片 url
 * @param size - 可选参数,需要生成的图片尺寸,默认为 500(mv 场景传入 "464y260" 字符串)
 * @returns 根据 url 和 size 参数生成的图片 url
 */
export const getCoverUrl = (url: string | null | undefined, size: number | string = 500): string => {
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
