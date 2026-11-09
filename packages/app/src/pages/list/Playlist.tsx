import PlatformLabel from "@/components/PlatformLabel";
import { useMusicPlatform, platformApi } from "@/lib/musicPlatform";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { List, Play } from "lucide-react";
import { formatNumber, getTimestampTime, playAllSongs, type Platform, type Song, type api } from "@met/core";
import formatData, { getCoverUrl } from "@/lib/formatData";
import SongList from "@/components/list/SongList";
import { ExpandableText } from "@/components/ExpandableText";
import { FuzzySearchInput } from "@/components/list/FuzzySearchInput";
import { DropdownMenu, type MenuItemDef } from "@/components/ui/menu";
import { getAssetUrl } from "@/platform/web";
import { useSiteDataStore } from "@/stores/siteData";
import { useStatusStore } from "@/stores/status";

/** 创建者头像地址(对照旧 playlist.vue:追加规格参数并升级 https) */
const creatorAvatarUrl = (avatarUrl: unknown): string => {
  if (typeof avatarUrl !== "string" || !avatarUrl) {
    return getAssetUrl("/images/pic/avatar.jpg");
  }
  return `${avatarUrl}?param=300y300`.replace(/^http:/, "https:");
};

const BIG_LIST_THRESHOLD = 800;
const SCREENS_PER_PAGE = 5;

const viewportHeight = (main: HTMLElement) =>
  main.clientHeight - parseFloat(getComputedStyle(main).paddingBottom);

const visibleRowCount = (main: HTMLElement) => {
  // 标准封面行包含 h-10 封面、上下 py-2 和两条 1px 边框。
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Math.max(1, Math.floor(viewportHeight(main) / (3.5 * rem + 2)));
};

const formatPlaylistSongs = (songs: api.WebSong[] | undefined, platform: Platform): Song[] =>
  formatData(songs, "song")?.map((song) => ({
    ...song,
    source: platform === "netease" ? "netease" : song.source ?? "qqmusic",
  })) ?? [];

/** 歌单详情页(id 来自 search params;/like-songs 复用本组件,无 id 时依赖登录态) */
export default function Playlist() {
  const search = useSearch({ strict: false }) as { id?: number | string };
  const platform = useMusicPlatform();
  const id = search.id;
  const userLoginStatus = useSiteDataStore((s) => platform === "qq" ? s.userLoginStatus : s.neteaseAccount.loggedIn);
  const userPlaylists = useSiteDataStore((s) => platform === "qq" ? s.userLikeData.playlists : s.neteaseAccount.playlists) as {
    id?: number | string;
  }[];

  // like-songs 形态(无 id):已登录时取「我喜欢」歌单
  // (对照旧 playlist.vue:userLikeData.playlists[0]?.id)
  const likeSongsId = userLoginStatus ? (userPlaylists[0]?.id ?? null) : null;
  const playlistId = id != null && id !== "" ? id : likeSongsId;
  if (playlistId == null || playlistId === "") {
    // like-songs 形态(路由无 id):未登录时不发请求,提示登录
    if (!userLoginStatus) {
      return (
        <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2">
          <p className="text-lg font-medium text-[var(--met-fg)]">请登录后使用</p>
          <p className="text-sm text-[var(--met-fg-dim)]">
            登录账号后即可查看「我喜欢的音乐」歌单
          </p>
        </div>
      );
    }
    // 已登录但用户歌单尚未就绪(setUserProfile 可能仍在拉取)
    return (
      <div className="py-24 text-center text-sm text-[var(--met-fg-dim)]">
        正在获取「我喜欢的音乐」歌单…
      </div>
    );
  }

  return <PlaylistContent key={JSON.stringify([platform, playlistId])} platform={platform} playlistId={playlistId} />;
}

function PlaylistContent({ platform, playlistId }: { platform: Platform; playlistId: string | number }) {
  const musicApi = platformApi(platform);
  const queryClient = useQueryClient();
  const isInRoom = useStatusStore((s) => s.isInRoom);
  const [keyword, setKeyword] = useState("");
  const searching = keyword.trim() !== "";
  const [pageElement, setPageElement] = useState<HTMLDivElement | null>(null);
  const scrollRoot = pageElement?.closest("main");
  const listRef = useRef<HTMLDivElement>(null);
  const playbackRequest = useRef(0);
  const [visibleRows, setVisibleRows] = useState(0);
  const [fullListLoadedCount, setFullListLoadedCount] = useState(0);

  useLayoutEffect(() => {
    if (!scrollRoot) return;
    scrollRoot.scrollTop = 0;
    const measure = () => setVisibleRows(visibleRowCount(scrollRoot));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scrollRoot);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useLayoutEffect(() => () => {
    playbackRequest.current += 1;
  }, []);

  const detailQuery = useQuery({
    queryKey: [platform, "playlist", "detail", playlistId],
    queryFn: () => musicApi.getPlayListDetail(playlistId),
  });
  const detail = detailQuery.data?.playlist;
  const trackCount = detail?.trackCount ?? null;
  const loadWholePlaylist = visibleRows > BIG_LIST_THRESHOLD;
  const fullQueryKey = [platform, "playlist", "all-songs", playlistId, trackCount];

  const fetchPage = async (offset: number, pageLimit: number, cachedSongs?: api.WebSong[]) => {
    const limit = trackCount == null ? pageLimit : Math.min(pageLimit, trackCount - offset);
    if (limit <= 0) return { songs: [], nextOffset: undefined };
    const songs = cachedSongs
      ? cachedSongs.slice(offset, offset + limit)
      : (await musicApi.getAllPlayList(playlistId, limit, offset)).songs;
    const nextOffset = offset + limit;
    const hasMore = songs.length > 0 && (trackCount == null ? songs.length >= limit : nextOffset < trackCount);
    return { songs, nextOffset: hasMore ? nextOffset : undefined };
  };

  const pagedQuery = useInfiniteQuery({
    queryKey: [platform, "playlist", "pages", playlistId, trackCount],
    enabled: detailQuery.isSuccess && visibleRows > 0 && !loadWholePlaylist,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const cached = queryClient.getQueryData<api.WebSong[]>(fullQueryKey);
      // 缺失的曲目可能让数组下标与服务端 offset 不一致。
      const contiguous = trackCount == null || cached?.length === trackCount;
      const rows = scrollRoot ? visibleRowCount(scrollRoot) : visibleRows;
      const pageSize = (rows > BIG_LIST_THRESHOLD ? visibleRows : rows) * SCREENS_PER_PAGE;
      return fetchPage(pageParam, pageSize, contiguous ? cached : undefined);
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });
  const pagedSongs = useMemo(() => pagedQuery.data?.pages.flatMap((page) => page.songs), [pagedQuery.data]);

  const fullQueryOptions = {
    queryKey: fullQueryKey,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const allSongs: api.WebSong[] = pagedSongs?.slice() ?? [];
      let offset = pagedQuery.data ? pagedQuery.data.pages.at(-1)?.nextOffset : 0;
      setFullListLoadedCount(allSongs.length);
      while (offset != null) {
        const page = await fetchPage(offset, BIG_LIST_THRESHOLD);
        signal.throwIfAborted();
        allSongs.push(...page.songs);
        setFullListLoadedCount(allSongs.length);
        offset = page.nextOffset;
      }
      return allSongs;
    },
  };
  const fullQuery = useQuery({
    ...fullQueryOptions,
    enabled: detailQuery.isSuccess && (loadWholePlaylist || (searching && pagedQuery.hasNextPage)),
  });
  const rawSongs = searching || loadWholePlaylist ? fullQuery.data ?? pagedSongs : pagedSongs;
  const songs = useMemo(() => formatPlaylistSongs(rawSongs, platform), [rawSongs, platform]);

  const { fetchNextPage, hasNextPage, isFetchNextPageError } = pagedQuery;
  const shouldLoadOnScroll = hasNextPage && !searching && !loadWholePlaylist
    && !fullQuery.isFetching && !pagedQuery.isFetching && !isFetchNextPageError;
  useEffect(() => {
    if (!scrollRoot || !shouldLoadOnScroll) return;
    const onScroll = () => {
      const list = listRef.current?.getBoundingClientRect();
      const viewportBottom = scrollRoot.getBoundingClientRect().top + viewportHeight(scrollRoot);
      if (list && viewportBottom >= list.top + list.height / 2) {
        void fetchNextPage({ cancelRefetch: false });
      }
    };
    scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollRoot.removeEventListener("scroll", onScroll);
  }, [scrollRoot, shouldLoadOnScroll, fetchNextPage]);

  const loadPlaybackSongs = async () => {
    const request = ++playbackRequest.current;
    if (fullQuery.data === rawSongs || !hasNextPage) return songs;
    try {
      const allSongs = fullQuery.data ?? await queryClient.fetchQuery(fullQueryOptions);
      if (request !== playbackRequest.current || useStatusStore.getState().isInRoom) return;
      return formatPlaylistSongs(allSongs, platform);
    } catch {
      // 复用下方全量加载失败提示。
    }
  };

  // 更多操作(对照旧 playlist.vue moreOptions)
  const moreOptions: MenuItemDef[] = [
    {
      key: "open-source",
      label: "打开源页面链接",
      onSelect: () => {
        if (playlistId != null) window.open(platform === "netease"
          ? `https://music.163.com/#/playlist?id=${encodeURIComponent(playlistId)}`
          : `https://y.qq.com/n/ryqq/playlist/${encodeURIComponent(playlistId)}`);
      },
    },
    {
      key: "open-classic",
      label: "打开经典播放器",
      onSelect: () => {
        if (playlistId != null) {
          const params = new URLSearchParams({ tid: String(playlistId), platform });
          window.open(`/classic/player/?${params}`);
        }
      },
    },
  ];

  if (detailQuery.isError) {
    return (
      <div className="py-24 text-center text-sm text-[var(--met-fg-dim)]">
        歌单加载失败,请稍后重试
      </div>
    );
  }

  return (
    <div ref={setPageElement} className="mx-auto flex w-full max-w-5xl flex-col px-4 py-6">
      <PlatformLabel />
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
            <h1 className="truncate text-2xl font-semibold text-[var(--met-fg)]" title={detail.name ?? undefined}>
              {detail.name}
            </h1>
            {/* 创建者(对照旧 .creator:头像 / 昵称 / 创建时间) */}
            {detail.creator || detail.createTime ? (
              <div className="flex items-center gap-2">
                <img
                  src={creatorAvatarUrl(detail.creator?.avatarUrl)}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.dataset.fallback) return;
                    img.dataset.fallback = "1";
                    img.src = getAssetUrl("/images/pic/avatar.jpg");
                  }}
                  className="h-7 w-7 shrink-0 rounded-full bg-[var(--met-bg-elevated)] object-cover"
                />
                <span className="truncate text-sm text-[var(--met-fg)]">
                  {detail.creator?.nickname || "未知创建者"}
                </span>
                {detail.createTime ? (
                  <span className="shrink-0 text-xs text-[var(--met-fg-dim)]">
                    {getTimestampTime(detail.createTime)} 创建
                  </span>
                ) : null}
              </div>
            ) : null}
            {/* 简介(过长时原地向下展开,替代原生 title 信息框) */}
            {detail.description ? <ExpandableText text={detail.description} /> : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--met-fg-dim)]">
              <span>共 {detail.trackCount ?? songs.length} 首歌曲</span>
              {detail.playCount ? (
                <span>播放 {formatNumber(detail.playCount)}</span>
              ) : null}
              {detail.updateTime ? (
                <span>{getTimestampTime(detail.updateTime)} 更新</span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {fullQuery.isFetching ? (
        <div role="status" className="mt-4 rounded-lg border border-[var(--met-border)] bg-[var(--met-bg-elevated)] px-4 py-2 text-center text-sm text-[var(--met-fg-dim)]">
          正在加载完整歌单… 已加载 {fullListLoadedCount}{trackCount != null ? `/${trackCount}` : ""} 首
        </div>
      ) : null}

      {/* 功能区:播放全部(房内禁用)+ 更多操作 + 模糊搜索(对照 Album.tsx 模式) */}
      {songs.length ? (
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isInRoom}
              title={isInRoom ? "一起听房间内暂不支持播放全部" : "播放全部"}
              onClick={async () => {
                const playlist = await loadPlaybackSongs();
                if (playlist?.length) void playAllSongs(playlist, "normal");
              }}
              className="flex items-center gap-1.5 rounded-full bg-[var(--met-primary)] px-4 py-1.5 text-sm font-medium text-[var(--met-primary-fg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play size={16} fill="currentColor" aria-hidden="true" />
              播放全部
            </button>
            <DropdownMenu
              items={moreOptions}
              align="start"
              ariaLabel="更多操作"
              title="更多操作"
              triggerClassName="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--met-border)] text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)]"
            >
              <List size={16} aria-hidden="true" />
            </DropdownMenu>
            <span className="text-xs text-[var(--met-fg-dim)]">
              {hasNextPage && rawSongs === pagedSongs ? `已加载 ${songs.length}` : `共 ${songs.length}`} 首
            </span>
          </div>
          <FuzzySearchInput value={keyword} onChange={setKeyword} />
        </div>
      ) : null}

      {/* 歌曲列表 */}
      <div ref={listRef} className="mt-2">
        <SongList
          songs={songs}
          loading={loadWholePlaylist ? fullQuery.isPending : pagedQuery.isPending || (searching && !fullQuery.data && fullQuery.isFetching)}
          filterKeyword={keyword}
          loadPlaybackList={hasNextPage && rawSongs === pagedSongs ? loadPlaybackSongs : undefined}
        />
      </div>
      {pagedQuery.isFetchingNextPage ? (
        <div role="status" className="py-2 text-center text-sm text-[var(--met-fg-dim)]">正在加载更多歌曲…</div>
      ) : null}
      {(loadWholePlaylist ? fullQuery.isError : pagedQuery.isError || fullQuery.isError) ? (
        <button
          type="button"
          className="mx-auto py-3 text-sm text-[var(--met-primary)]"
          onClick={() => {
            if (isFetchNextPageError && !loadWholePlaylist) void fetchNextPage({ cancelRefetch: false });
            else if (fullQuery.isError) void fullQuery.refetch();
            else void pagedQuery.refetch();
          }}
        >
          歌曲加载失败，点击重试
        </button>
      ) : null}
    </div>
  );
}
