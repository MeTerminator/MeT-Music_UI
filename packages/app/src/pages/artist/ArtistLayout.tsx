import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useSearch } from "@tanstack/react-router";
import { api, formatNumber } from "@met/core";
import formatData from "@/lib/formatData";

const TABS = [
  { to: "/artist/hot", label: "热门" },
  { to: "/artist/songs", label: "单曲" },
  { to: "/artist/albums", label: "专辑" },
  { to: "/artist/videos", label: "视频" },
] as const;

/** 歌手详情(formatData artist 分支 + identify 附加字段) */
interface ArtistDetail {
  id?: number | string;
  name?: string;
  alias?: string[];
  cover?: string;
  coverSize?: { s?: string; m?: string; l?: string };
  description?: string;
  identify?: string;
  size?: { music?: number; album?: number; mv?: number; fans?: number };
}

/** 歌手页布局:头部详情 + tab 导航 + 子路由出口(对照旧 views/Artist/index.vue) */
export default function ArtistLayout() {
  const search = useSearch({ strict: false }) as { id?: string };
  const id = search.id;

  const detailQuery = useQuery({
    queryKey: ["artist", "detail", id],
    queryFn: () => api.getArtistDetail(id as number | string),
    enabled: id != null && id !== "",
  });

  const artist = useMemo<ArtistDetail | null>(() => {
    // 原始接口字段访问豁免点(响应无稳定 schema)
    const raw = (detailQuery.data as any)?.data; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!raw?.artist) return null;
    const formatted = (formatData(raw.artist, "artist")?.[0] ?? null) as ArtistDetail | null;
    if (formatted) formatted.identify = raw.identify?.imageDesc;
    return formatted;
  }, [detailQuery.data]);

  if (id == null || id === "") {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2">
        <p className="text-2xl font-semibold text-[var(--met-fg)]">参数不完整</p>
        <button
          type="button"
          onClick={() => history.back()}
          className="rounded-full border border-[var(--met-border)] px-4 py-1.5 text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)]"
        >
          返回上一页
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-6">
      {/* 头部详情 */}
      {detailQuery.isLoading || (!artist && !detailQuery.isError) ? (
        <div className="flex animate-pulse gap-5">
          <div className="h-40 w-40 shrink-0 rounded-full bg-[var(--met-bg-elevated)]" />
          <div className="flex flex-1 flex-col justify-center gap-3">
            <div className="h-6 w-1/3 rounded bg-[var(--met-bg-elevated)]" />
            <div className="h-3 w-1/4 rounded bg-[var(--met-bg-elevated)]" />
            <div className="h-3 w-2/3 rounded bg-[var(--met-bg-elevated)]" />
          </div>
        </div>
      ) : detailQuery.isError ? (
        <div className="py-6 text-center text-sm text-[var(--met-fg-dim)]">
          歌手数据获取失败,请稍后重试
        </div>
      ) : artist ? (
        <div className="flex gap-5">
          {/* 头像 */}
          <img
            src={artist.coverSize?.m}
            alt=""
            className="h-40 w-40 shrink-0 rounded-full bg-[var(--met-bg-elevated)] object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
            {/* 名称 / 别名 */}
            <h1 className="truncate text-2xl font-semibold text-[var(--met-fg)]">
              {artist.name || "未知艺术家"}
              {artist.alias?.length ? (
                <span className="ml-2 text-base font-normal text-[var(--met-fg-dim)]">
                  ({artist.alias[0]})
                </span>
              ) : null}
            </h1>
            {/* 职业 */}
            {artist.identify ? (
              <span className="text-sm text-[var(--met-fg-dim)]">{artist.identify}</span>
            ) : null}
            {/* 数据统计 */}
            <div className="flex flex-wrap gap-4 text-xs text-[var(--met-fg-dim)]">
              {artist.size?.music ? (
                <Link to="/artist/songs" search={{ id }} className="transition-colors hover:text-[var(--met-primary)]">
                  单曲 {formatNumber(artist.size.music)}
                </Link>
              ) : null}
              {artist.size?.album ? (
                <Link to="/artist/albums" search={{ id }} className="transition-colors hover:text-[var(--met-primary)]">
                  专辑 {formatNumber(artist.size.album)}
                </Link>
              ) : null}
              {artist.size?.mv ? (
                <Link to="/artist/videos" search={{ id }} className="transition-colors hover:text-[var(--met-primary)]">
                  视频 {formatNumber(artist.size.mv)}
                </Link>
              ) : null}
              {artist.size?.fans ? <span>粉丝 {formatNumber(artist.size.fans)}</span> : null}
            </div>
            {/* 简介(截断) */}
            {artist.description ? (
              <p className="line-clamp-3 text-sm text-[var(--met-fg-dim)]" title={artist.description}>
                {artist.description}
              </p>
            ) : (
              <p className="text-sm text-[var(--met-fg-dim)]">哇！竟然没有简介</p>
            )}
          </div>
        </div>
      ) : null}

      {/* 标签页导航 */}
      <nav className="mt-5 flex gap-1 border-b border-[var(--met-border)]">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            search={{ id }}
            className="rounded-t-md px-4 py-2 text-sm text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-fg)]"
            activeProps={{
              className:
                "rounded-t-md px-4 py-2 text-sm font-medium text-[var(--met-primary)] border-b-2 border-[var(--met-primary)]",
            }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* 子路由 */}
      <div className="min-h-0 flex-1 pt-2">
        <Outlet />
      </div>
    </div>
  );
}
