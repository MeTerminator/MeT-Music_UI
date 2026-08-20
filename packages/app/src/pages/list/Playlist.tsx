import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { api, playAllSongs, type Song } from "@met/core";
import formatData, { getCoverUrl } from "@/lib/formatData";
import SongList from "@/components/list/SongList";
import { useSiteDataStore } from "@/stores/siteData";

/** 歌单详情页(id 来自 search params;/like-songs 复用本组件,无 id 时依赖登录态) */
export default function Playlist() {
  const search = useSearch({ strict: false }) as { id?: number | string };
  const id = search.id;
  const userLoginStatus = useSiteDataStore((s) => s.userLoginStatus);
  const userPlaylists = useSiteDataStore((s) => s.userLikeData.playlists) as {
    id?: number | string;
  }[];

  // like-songs 形态(无 id):已登录时取「我喜欢」歌单
  // (对照旧 playlist.vue:userLikeData.playlists[0]?.id)
  const likeSongsId = userLoginStatus ? (userPlaylists[0]?.id ?? null) : null;
  const playlistId = id != null && id !== "" ? id : likeSongsId;
  const enabled = playlistId != null && playlistId !== "";

  // 歌单详情(名称/简介/封面/歌曲数)
  const detailQuery = useQuery({
    queryKey: ["playlist", "detail", playlistId],
    queryFn: () => api.getPlayListDetail(playlistId as number | string),
    enabled,
  });

  // 歌单全部歌曲
  const songsQuery = useQuery({
    queryKey: ["playlist", "songs", playlistId],
    queryFn: () => api.getAllPlayList(playlistId as number | string, 500, 0),
    enabled,
  });

  const detail = detailQuery.data?.playlist;
  const songs = useMemo<Song[]>(
    () => formatData(songsQuery.data?.songs, "song") ?? [],
    [songsQuery.data],
  );

  if (!enabled) {
    // like-songs 形态(路由无 id):未登录时不发请求,提示登录
    if (!userLoginStatus) {
      return (
        <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2">
          <p className="text-lg font-medium text-[var(--met-fg)]">请登录后使用</p>
          <p className="text-sm text-[var(--met-fg-dim)]">
            登录账号后即可查看「我喜欢的音乐」歌单
          </p>
        </div>
      );
    }
    // 已登录但用户歌单尚未就绪(setUserProfile 可能仍在拉取)
    return (
      <div className="py-24 text-center text-sm text-[var(--met-fg-dim)]">
        正在获取「我喜欢的音乐」歌单…
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="py-24 text-center text-sm text-[var(--met-fg-dim)]">
        歌单加载失败,请稍后重试
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-6">
      {/* 头部信息 */}
      {detailQuery.isLoading || !detail ? (
        <div className="flex animate-pulse gap-5">
          <div className="h-40 w-40 shrink-0 rounded-xl bg-[var(--met-bg-elevated)]" />
          <div className="flex flex-1 flex-col justify-center gap-3">
            <div className="h-5 w-1/3 rounded bg-[var(--met-bg-elevated)]" />
            <div className="h-3 w-2/3 rounded bg-[var(--met-bg-elevated)]" />
            <div className="h-3 w-1/4 rounded bg-[var(--met-bg-elevated)]" />
          </div>
        </div>
      ) : (
        <div className="flex gap-5">
          <img
            src={getCoverUrl(detail.coverImgUrl, 300)}
            alt=""
            className="h-40 w-40 shrink-0 rounded-xl bg-[var(--met-bg-elevated)] object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
            <h1 className="truncate text-2xl font-semibold text-[var(--met-fg)]" title={detail.name}>
              {detail.name}
            </h1>
            {detail.description ? (
              <p
                className="line-clamp-2 text-sm text-[var(--met-fg-dim)]"
                title={detail.description}
              >
                {detail.description}
              </p>
            ) : null}
            <span className="text-xs text-[var(--met-fg-dim)]">
              共 {detail.trackCount ?? songs.length} 首歌曲
            </span>
          </div>
        </div>
      )}

      {/* 歌曲列表 */}
      <div className="mt-4">
        <SongList
          songs={songs}
          loading={songsQuery.isLoading}
          onPlayAll={() => playAllSongs(songs, "normal")}
        />
      </div>
    </div>
  );
}
