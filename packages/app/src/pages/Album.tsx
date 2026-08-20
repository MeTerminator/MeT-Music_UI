import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { api, formatNumber, getTimestampTime, playAllSongs, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import SongList from "@/components/list/SongList";

/** 专辑详情(formatData album 分支) */
interface AlbumDetail {
  id?: number | string;
  name?: string;
  alia?: string;
  coverSize?: { s?: string; m?: string; l?: string };
  artists?: { id?: number | string; name?: string }[];
  description?: string;
  publishTime?: number;
  count?: number;
  share?: number;
}

/** 专辑详情页(对照旧 views/List/album.vue) */
export default function Album() {
  const search = useSearch({ strict: false }) as { id?: number | string };
  const id = search.id;
  const [keyword, setKeyword] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["album", "detail", id],
    queryFn: () => api.getAlbumDetail(id as number | string),
    enabled: id != null && id !== "",
  });

  // 原始接口字段访问豁免点
  const raw = data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const detail = useMemo<AlbumDetail | null>(
    () => (raw?.album ? ((formatData(raw.album, "album")?.[0] ?? null) as AlbumDetail | null) : null),
    [raw],
  );
  const songs = useMemo<Song[]>(() => formatData(raw?.songs, "song") ?? [], [raw]);

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

  if (isError) {
    return (
      <div className="py-24 text-center text-sm text-[var(--met-fg-dim)]">
        专辑加载失败,请稍后重试
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-6">
      {/* 头部信息 */}
      {isLoading || !detail ? (
        <div className="flex animate-pulse gap-5">
          <div className="h-40 w-40 shrink-0 rounded-xl bg-[var(--met-bg-elevated)]" />
          <div className="flex flex-1 flex-col justify-center gap-3">
            <div className="h-6 w-1/3 rounded bg-[var(--met-bg-elevated)]" />
            <div className="h-3 w-1/4 rounded bg-[var(--met-bg-elevated)]" />
            <div className="h-3 w-2/3 rounded bg-[var(--met-bg-elevated)]" />
          </div>
        </div>
      ) : (
        <div className="flex gap-5">
          <img
            src={detail.coverSize?.l}
            alt=""
            className="h-40 w-40 shrink-0 rounded-xl bg-[var(--met-bg-elevated)] object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
            <h1 className="truncate text-2xl font-semibold text-[var(--met-fg)]" title={detail.name}>
              {detail.name || "未知专辑"}
              {detail.alia ? (
                <span className="ml-2 text-base font-normal text-[var(--met-fg-dim)]">
                  ({detail.alia})
                </span>
              ) : null}
            </h1>
            {/* 歌手 */}
            {detail.artists?.length ? (
              <div className="flex flex-wrap items-center gap-1 text-sm text-[var(--met-fg-dim)]">
                {detail.artists.map((ar, i) => (
                  <span key={`${ar.id}-${i}`} className="flex items-center">
                    <Link
                      to="/artist"
                      search={{ id: ar.id != null ? String(ar.id) : undefined }}
                      className="transition-colors hover:text-[var(--met-primary)]"
                    >
                      {ar.name}
                    </Link>
                    {i < (detail.artists?.length ?? 0) - 1 ? <span className="mx-1">/</span> : null}
                  </span>
                ))}
              </div>
            ) : null}
            {/* 数量 / 分享 / 发行时间 */}
            <div className="flex flex-wrap gap-4 text-xs text-[var(--met-fg-dim)]">
              {detail.count ? <span>共 {detail.count} 首</span> : null}
              {detail.share ? <span>分享 {formatNumber(detail.share)}</span> : null}
              {detail.publishTime ? (
                <span>{getTimestampTime(detail.publishTime)} 发布</span>
              ) : null}
            </div>
            {/* 简介 */}
            {detail.description ? (
              <p className="line-clamp-2 text-sm text-[var(--met-fg-dim)]" title={detail.description}>
                {detail.description}
              </p>
            ) : (
              <p className="text-sm text-[var(--met-fg-dim)]">太懒了吧,连简介都没写</p>
            )}
          </div>
        </div>
      )}

      {/* 功能区:播放全部 + 模糊搜索 */}
      {!isLoading && songs.length ? (
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void playAllSongs(songs, "normal")}
            className="flex items-center gap-1.5 rounded-full bg-[var(--met-primary)] px-4 py-1.5 text-sm font-medium text-[var(--met-bg)] transition-opacity hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            播放全部
          </button>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="模糊搜索"
            className="h-9 w-36 rounded-full border border-[var(--met-border)] bg-transparent px-4 text-sm text-[var(--met-fg)] outline-none transition-all placeholder:text-[var(--met-fg-dim)] focus:w-52 focus:border-[var(--met-primary)]"
          />
        </div>
      ) : null}

      {/* 曲目列表 */}
      <div className="mt-2">
        <SongList songs={songs} loading={isLoading} showAlbum={false} filterKeyword={keyword} />
      </div>
    </div>
  );
}
