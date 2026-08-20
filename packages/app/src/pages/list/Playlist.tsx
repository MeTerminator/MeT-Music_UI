import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { List, Play } from "lucide-react";
import { api, formatNumber, getTimestampTime, playAllSongs, type Song } from "@met/core";
import formatData, { getCoverUrl } from "@/lib/formatData";
import SongList from "@/components/list/SongList";
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

/** 超大歌单阈值与分片大小(对照旧 playlist.vue getBigPlayListData:>=800 触发,每片 800) */
const BIG_LIST_THRESHOLD = 800;
const BIG_LIST_CHUNK = 800;

/** 歌单详情页(id 来自 search params;/like-songs 复用本组件,无 id 时依赖登录态) */
export default function Playlist() {
  const search = useSearch({ strict: false }) as { id?: number | string };
  const id = search.id;
  const [keyword, setKeyword] = useState("");
  const isInRoom = useStatusStore((s) => s.isInRoom);
  const userLoginStatus = useSiteDataStore((s) => s.userLoginStatus);
  const userPlaylists = useSiteDataStore((s) => s.userLikeData.playlists) as {
    id?: number | string;
  }[];

  // like-songs 形态(无 id):已登录时取「我喜欢」歌单
  // (对照旧 playlist.vue:userLikeData.playlists[0]?.id)
  const likeSongsId = userLoginStatus ? (userPlaylists[0]?.id ?? null) : null;
  const playlistId = id != null && id !== "" ? id : likeSongsId;
  const enabled = playlistId != null && playlistId !== "";

  // 歌单详情(名称/简介/封面/歌曲数)
  const detailQuery = useQuery({
    queryKey: ["playlist", "detail", playlistId],
    queryFn: () => api.getPlayListDetail(playlistId as number | string),
    enabled,
  });

  const detail = detailQuery.data?.playlist;
  const trackCount = Number(detail?.trackCount) || 0;

  // 超大歌单分片加载进度(null = 非分片加载或已完成)
  const [bigListProgress, setBigListProgress] = useState<{
    loaded: number;
    total: number;
  } | null>(null);

  // 歌单全部歌曲:trackCount >= 800 时分片循环拉全量(对照旧 getBigPlayListData)
  const songsQuery = useQuery({
    queryKey: ["playlist", "songs", playlistId, trackCount],
    enabled: enabled && detailQuery.isSuccess,
    queryFn: async () => {
      if (trackCount < BIG_LIST_THRESHOLD) {
        return api.getAllPlayList(playlistId as number | string, trackCount || 500, 0);
      }
      // 分片循环拉取并聚合
      const allSongs: unknown[] = [];
      setBigListProgress({ loaded: 0, total: trackCount });
      try {
        let offset = 0;
        while (offset < trackCount) {
          const res = await api.getAllPlayList(
            playlistId as number | string,
            BIG_LIST_CHUNK,
            offset,
          );
          const chunk: unknown[] = Array.isArray(res?.songs) ? res.songs : [];
          allSongs.push(...chunk);
          offset += BIG_LIST_CHUNK;
          setBigListProgress({
            loaded: Math.min(allSongs.length, trackCount),
            total: trackCount,
          });
          // 后端提前见底,防止死循环
          if (chunk.length === 0) break;
        }
      } finally {
        setBigListProgress(null);
      }
      return { songs: allSongs };
    },
  });

  const songs = useMemo<Song[]>(
    () => formatData(songsQuery.data?.songs, "song") ?? [],
    [songsQuery.data],
  );

  // 更多操作(对照旧 playlist.vue moreOptions)
  const moreOptions: MenuItemDef[] = [
    {
      key: "open-source",
      label: "打开源页面链接",
      onSelect: () => {
        if (playlistId != null) window.open(`https://y.qq.com/n/ryqq/playlist/${playlistId}`);
      },
    },
    {
      key: "open-classic",
      label: "打开经典播放器",
      onSelect: () => {
        if (playlistId != null) window.open(`/classic/player/?tid=${playlistId}`);
      },
    },
  ];

  if (!enabled) {
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

  if (detailQuery.isError) {
    return (
      <div className="py-24 text-center text-sm text-[var(--met-fg-dim)]">
        歌单加载失败,请稍后重试
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-6">
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
            <h1 className="truncate text-2xl font-semibold text-[var(--met-fg)]" title={detail.name}>
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
            {detail.description ? (
              <p
                className="line-clamp-2 text-sm text-[var(--met-fg-dim)]"
                title={detail.description}
              >
                {detail.description}
              </p>
            ) : null}
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

      {/* 超大歌单分片加载进度(对照旧「该歌单歌曲数量过多，请稍等」提示) */}
      {bigListProgress ? (
        <div className="mt-4 rounded-lg border border-[var(--met-border)] bg-[var(--met-bg-elevated)] px-4 py-2 text-center text-sm text-[var(--met-fg-dim)]">
          该歌单歌曲数量过多，请稍等… 已加载 {bigListProgress.loaded}/
          {bigListProgress.total} 首
        </div>
      ) : null}

      {/* 功能区:播放全部(房内禁用)+ 更多操作 + 模糊搜索(对照 Album.tsx 模式) */}
      {!songsQuery.isPending && songs.length ? (
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isInRoom}
              title={isInRoom ? "一起听房间内暂不支持播放全部" : "播放全部"}
              onClick={() => void playAllSongs(songs, "normal")}
              className="flex items-center gap-1.5 rounded-full bg-[var(--met-primary)] px-4 py-1.5 text-sm font-medium text-[var(--met-bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
            <span className="text-xs text-[var(--met-fg-dim)]">共 {songs.length} 首</span>
          </div>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="模糊搜索"
            className="h-9 w-36 rounded-full border border-[var(--met-border)] bg-transparent px-4 text-sm text-[var(--met-fg)] outline-none transition-all placeholder:text-[var(--met-fg-dim)] focus:w-52 focus:border-[var(--met-primary)]"
          />
        </div>
      ) : null}

      {/* 歌曲列表 */}
      <div className="mt-2">
        <SongList songs={songs} loading={songsQuery.isPending} filterKeyword={keyword} />
      </div>
    </div>
  );
}
