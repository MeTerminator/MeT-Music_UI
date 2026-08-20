import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { api, playAllSongs, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import SongList from "@/components/list/SongList";
import { useSettingsStore } from "@/stores/settings";

/** 歌手 - 全部单曲(分页,对照旧 views/Artist/songs.vue) */
export default function Songs() {
  const search = useSearch({ strict: false }) as { id?: number | string };
  const id = search.id;
  const loadSize = useSettingsStore((s) => s.loadSize);
  const pageSize = loadSize > 0 ? loadSize : 50;
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["artist", "songs", id, page, pageSize],
    queryFn: () => api.getArtistAllSongs(id as number | string, pageSize, (page - 1) * pageSize),
    enabled: id != null && id !== "",
    placeholderData: keepPreviousData,
  });

  // 原始接口字段访问豁免点
  const raw = data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const total: number = raw?.total ?? 0;
  const songs = useMemo<Song[]>(() => formatData(raw?.songs, "song") ?? [], [raw]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (isError) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">
        获取歌手全部歌曲失败,请稍后重试
      </div>
    );
  }

  if (!isLoading && total === 0) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">当前歌手暂无歌曲</div>
    );
  }

  return (
    <div className="flex flex-col pt-2">
      <SongList
        songs={songs}
        loading={isLoading}
        onPlayAll={() => void playAllSongs(songs, "normal")}
        indexOffset={(page - 1) * pageSize}
      />
      {/* 分页 */}
      {total > pageSize ? (
        <div className="flex items-center justify-center gap-3 py-6">
          <button
            type="button"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-full border border-[var(--met-border)] px-4 py-1.5 text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            上一页
          </button>
          <span className="min-w-16 text-center text-xs text-[var(--met-fg-dim)]">
            {page} / {totalPages} 页
          </span>
          <button
            type="button"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-full border border-[var(--met-border)] px-4 py-1.5 text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}
