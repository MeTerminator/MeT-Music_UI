import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { api, getTimestampTime } from "@met/core";
import formatData from "@/lib/formatData";
import CoverPlayButton from "@/components/cover/CoverPlayButton";
import { PrevNextPager } from "@/components/ui/pagination";
import { useSettingsStore } from "@/stores/settings";

/** 专辑卡片数据(formatData album 分支) */
interface AlbumCard {
  id?: number | string;
  name?: string;
  alia?: string;
  coverSize?: { s?: string; m?: string };
  publishTime?: number;
}

/** 歌手 - 专辑(卡片栅格 + 分页,对照旧 views/Artist/albums.vue) */
export default function Albums() {
  const search = useSearch({ strict: false }) as { id?: number | string; page?: string };
  const id = search.id;
  const navigate = useNavigate();
  const loadSize = useSettingsStore((s) => s.loadSize);
  const pageSize = loadSize > 0 ? loadSize : 50;
  // 页码以 URL 为准(旧契约 Number(query.page) || 1,parseInt 容错)
  const parsedPage = Number.parseInt(search.page ?? "", 10);
  const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const setPage = (next: number) =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, page: String(next) }), replace: true });

  // 切换歌手(id 变化)时回到第一页:站内所有更改 id 的导航均显式传 search
  // (不携带 page),URL 天然回到第一页;不做 effect 重置(替代原 setPage(1)),
  // 以保证浏览器回退/前进能按历史还原页码(对照旧 songs.vue 亦无重置逻辑)。

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["artist", "albums", id, page, pageSize],
    queryFn: () => api.getArtistAblums(id as number | string, pageSize, (page - 1) * pageSize),
    enabled: id != null && id !== "",
    placeholderData: keepPreviousData,
  });

  // 原始接口字段访问豁免点
  const raw = data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const total: number = raw?.artist?.albumSize ?? 0;
  const albums = useMemo<AlbumCard[]>(
    () => (formatData(raw?.hotAlbums, "album") ?? []) as unknown as AlbumCard[],
    [raw],
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (isError) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">
        获取歌手专辑失败,请稍后重试
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-square w-full rounded-xl bg-[var(--met-bg-elevated)]" />
            <div className="mt-2 h-3 w-3/4 rounded bg-[var(--met-bg-elevated)]" />
            <div className="mt-1.5 h-2.5 w-1/2 rounded bg-[var(--met-bg-elevated)]" />
          </div>
        ))}
      </div>
    );
  }

  if (total === 0 || !albums.length) {
    return (
      <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">当前歌手暂无专辑</div>
    );
  }

  return (
    <div className="flex flex-col pt-4">
      {/* 专辑栅格 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {albums.map((album, index) => (
          <div key={`${album.id}-${index}`} className="group relative flex flex-col">
            <Link
              to="/album"
              search={{ id: album.id != null ? String(album.id) : undefined }}
              className="flex flex-col"
            >
              <img
                src={album.coverSize?.m}
                alt=""
                loading="lazy"
                className="aspect-square w-full rounded-xl bg-[var(--met-bg-elevated)] object-cover transition-transform group-hover:scale-[1.02]"
              />
              <span
                className="mt-2 truncate text-sm text-[var(--met-fg)] transition-colors group-hover:text-[var(--met-primary)]"
                title={album.name}
              >
                {album.name || "未知专辑"}
              </span>
              <span className="mt-0.5 truncate text-xs text-[var(--met-fg-dim)]">
                {album.publishTime ? getTimestampTime(album.publishTime) : ""}
              </span>
            </Link>
            {/* hover 播放全部(卡片兄弟层叠,点击不冒泡跳详情) */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex aspect-square items-center justify-center">
              <CoverPlayButton id={album.id} type="album" className="pointer-events-auto" />
            </div>
          </div>
        ))}
      </div>
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
