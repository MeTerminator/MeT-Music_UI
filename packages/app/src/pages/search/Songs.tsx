import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { api, playAllSongs, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import SongList from "@/components/list/SongList";

/** 搜索结果 - 单曲 */
export default function Songs() {
  const search = useSearch({ strict: false }) as { keywords?: string };
  const keywords = search.keywords ?? "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["search", "songs", keywords],
    queryFn: () => api.getSearchRes(keywords, 50, 0, 1),
    enabled: !!keywords,
  });

  const songs = useMemo<Song[]>(
    () => formatData(data?.result?.songs, "song") ?? [],
    [data],
  );

  if (!keywords) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">
        请输入关键词后再搜索
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">
        搜索出错了,请稍后重试
      </div>
    );
  }

  return (
    <SongList
      songs={songs}
      loading={isLoading}
      onPlayAll={() => playAllSongs(songs, "normal")}
    />
  );
}
