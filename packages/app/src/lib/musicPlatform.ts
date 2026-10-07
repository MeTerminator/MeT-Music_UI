import { useSearch } from "@tanstack/react-router";
import { api, type Platform } from "@met/core";
export function useMusicPlatform(): Platform {
  const search = useSearch({ strict: false }) as { platform?: Platform };
  return search.platform === "netease" ? "netease" : "qq";
}
export function platformApi(platform: Platform) {
  return {
    getSearchRes: (keywords: string, limit = 50, offset = 0, type = 1) => api.getSearchRes(keywords, limit, offset, type, platform),
    getAlbumDetail: (id: string | number) => api.getAlbumDetail(id, platform),
    getArtistDetail: (id: string | number) => api.getArtistDetail(id, platform),
    getArtistSongs: (id: string | number) => api.getArtistSongs(id, platform),
    getArtistAllSongs: (id: string | number, limit = 50, offset = 0, order = "hot") => api.getArtistAllSongs(id, limit, offset, order, platform),
    getArtistAblums: (id: string | number, limit = 50, offset = 0) => api.getArtistAblums(id, limit, offset, platform),
    getArtistVideos: (id: string | number, limit = 50, offset = 0) => api.getArtistVideos(id, limit, offset, platform),
    getPlayListDetail: (id: string | number) => api.getPlayListDetail(id, platform),
    getAllPlayList: (id: string | number, limit = 30, offset = 0) => api.getAllPlayList(id, limit, offset, platform),
    getMusicInfo: (id: string | number) => api.getMusicInfo(id, platform),
    getMusicUrl: (id: string | number, quality: string) => api.getMusicUrl(id, quality, platform),
    getSongLyric: (id: string | number) => api.getSongLyric(id, platform),
    getAMttmlLyric: (id: string | number) => api.getAMttmlLyric(id, platform),
    getComments: (id: string | number, page: number, size: number, cursor: string | number | undefined) => api.getComments(id, page, size, cursor, platform),
    getVideoDetail: (id: string | number) => api.getVideoDetail(id, platform),
    getVideoUrl: (id: string | number, r: string | number | null = null) => api.getVideoUrl(id, r, platform),
  };
}
