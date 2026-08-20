import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { api, playAllSongs, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import SongList from "@/components/list/SongList";
import { Pagination } from "@/components/ui/pagination";
import { useSettingsStore } from "@/stores/settings";

/** 搜索结果 - 单曲(type=1,分页对齐同目录 Videos.tsx 模式) */
export default function Songs() {
  const search = useSearch({ strict: false }) as { keywords?: string };
  const keywords = search.keywords ?? "";
  const searchLoadSize = useSettingsStore((s) => s.searchLoadSize) || 30;

  const [page, setPage] = useState(1);
  // 关键词变化时回到第一页
  useEffect(() => {
    setPage(1);
  }, [keywords]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["search", "songs", keywords, page, searchLoadSize],
    queryFn: () =>
      api.getSearchRes(keywords, searchLoadSize, (page - 1) * searchLoadSize, 1),
    enabled: !!keywords,
  });

  const totalCount: number = data?.result?.songCount ?? 0;
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
    <div>
      <SongList
        songs={songs}
        loading={isLoading}
        onPlayAll={() => playAllSongs(songs, "normal")}
        indexOffset={(page - 1) * searchLoadSize}
      />
      {/* 分页 */}
      <Pagination
        page={page}
        pageCount={Math.ceil(totalCount / searchLoadSize)}
        onChange={setPage}
      />
    </div>
  );
}
