import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { api, playAllSongs, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import SongList from "@/components/list/SongList";

/** 歌手 - 热门歌曲(对照旧 views/Artist/hot.vue,取热门前 50 首) */
export default function Hot() {
  const search = useSearch({ strict: false }) as { id?: string };
  const id = search.id;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["artist", "hot", id],
    queryFn: () => api.getArtistSongs(id as number | string),
    enabled: id != null && id !== "",
  });

  const songs = useMemo<Song[]>(() => {
    // 原始接口字段访问豁免点
    const raw = data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!raw) return [];
    // 与旧实现一致:hotSongs 首项带专辑封面时优先,否则回退 songs
    const source = raw.hotSongs?.[0]?.al?.picUrl ? raw.hotSongs : raw.songs;
    return (formatData(source, "song") ?? []).slice(0, 50);
  }, [data]);

  if (isError) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">
        获取歌手热门歌曲失败,请稍后重试
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between pt-4 pb-1">
        <h2 className="text-base font-semibold text-[var(--met-fg)]">热门歌曲</h2>
        <Link
          to="/artist/songs"
          search={{ id }}
          className="text-xs text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)]"
        >
          查看全部 ›
        </Link>
      </div>
      <SongList
        songs={songs}
        loading={isLoading}
        onPlayAll={() => void playAllSongs(songs, "normal")}
      />
    </div>
  );
}
