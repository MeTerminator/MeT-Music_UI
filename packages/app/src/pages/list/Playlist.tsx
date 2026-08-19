import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { api, playAllSongs, type Song } from "@met/core";
import formatData, { getCoverUrl } from "@/lib/formatData";
import SongList from "@/components/list/SongList";

/** 歌单详情页(id 来自 search params) */
export default function Playlist() {
  const search = useSearch({ strict: false }) as { id?: number | string };
  const id = search.id;

  // 歌单详情(名称/简介/封面/歌曲数)
  const detailQuery = useQuery({
    queryKey: ["playlist", "detail", id],
    queryFn: () => api.getPlayListDetail(id as number | string),
    enabled: id != null && id !== "",
  });

  // 歌单全部歌曲
  const songsQuery = useQuery({
    queryKey: ["playlist", "songs", id],
    queryFn: () => api.getAllPlayList(id as number | string, 500, 0),
    enabled: id != null && id !== "",
  });

  const detail = detailQuery.data?.playlist;
  const songs = useMemo<Song[]>(
    () => formatData(songsQuery.data?.songs, "song") ?? [],
    [songsQuery.data],
  );

  if (id == null || id === "") {
    return (
      <div className="py-24 text-center text-sm text-[var(--met-fg-dim)]">
        未指定歌单
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
