import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api, playAllSongs, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import SongList from "@/components/list/SongList";
import { PrevNextPager } from "@/components/ui/pagination";
import { useSettingsStore } from "@/stores/settings";

/** 歌手 - 全部单曲(分页,对照旧 views/Artist/songs.vue) */
export default function Songs() {
  const search = useSearch({ strict: false }) as { id?: number | string; page?: string };
  const id = search.id;
  const navigate = useNavigate();
  const loadSize = useSettingsStore((s) => s.loadSize);
  const pageSize = loadSize > 0 ? loadSize : 50;
  // 页码以 URL 为准(旧 songs.vue:Number(query.page) || 1,parseInt 容错)
  const parsedPage = Number.parseInt(search.page ?? "", 10);
  const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const setPage = (next: number) =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, page: String(next) }), replace: true });

  // 切换歌手(id 变化)时回到第一页:站内所有更改 id 的导航均显式传 search
  // (不携带 page),URL 天然回到第一页;不做 effect 重置(替代原 setPage(1)),
  // 以保证浏览器回退/前进能按历史还原页码(对照旧 songs.vue 亦无重置逻辑)。

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
        <PrevNextPager
          className="py-6"
          label={`${page} / ${totalPages} 页`}
          prevDisabled={page <= 1 || isFetching}
          nextDisabled={page >= totalPages || isFetching}
          onPrev={() => setPage(Math.max(1, page - 1))}
          onNext={() => setPage(Math.min(totalPages, page + 1))}
        />
      ) : null}
    </div>
  );
}
