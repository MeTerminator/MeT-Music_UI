import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api, playAllSongs, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import SongList from "@/components/list/SongList";
import { Pagination } from "@/components/ui/pagination";
import { useSettingsStore } from "@/stores/settings";

/** 搜索结果 - 单曲(type=1,分页对齐同目录 Videos.tsx 模式) */
export default function Songs() {
  const search = useSearch({ strict: false }) as { keywords?: string; page?: string };
  const keywords = search.keywords ?? "";
  const navigate = useNavigate();
  const searchLoadSize = useSettingsStore((s) => s.searchLoadSize) || 30;
  // 对照旧 playSong:search 页且未开启 playSearch 时「仅播放当前歌曲」(insert)
  const playSearch = useSettingsStore((s) => s.playSearch);

  // 页码以 URL 为准(旧契约 Number(query.page) || 1,parseInt 容错)
  const parsedPage = Number.parseInt(search.page ?? "", 10);
  const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const setPage = (next: number) =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, page: String(next) }), replace: true });

  // 关键词变化时回到第一页:站内所有更改 keywords 的导航均显式传 search
  // (不携带 page),URL 天然回到第一页;不做 effect 重置(替代原 setPage(1)),
  // 以保证浏览器回退/前进能按历史还原页码。

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
        playBehavior={playSearch ? "replace" : "insert"}
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
