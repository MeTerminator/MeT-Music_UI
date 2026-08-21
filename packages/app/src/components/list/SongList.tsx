import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ContextMenu as BaseContextMenu } from "@base-ui-components/react/context-menu";
import { Ellipsis, ListEnd, Locate, Play } from "lucide-react";
import { toast } from "sonner";
import {
  addSongToNext,
  fadePlayOrPause,
  fuzzySearch,
  getSongTime,
  initPlayer,
  type Song,
} from "@met/core";
import { copyText } from "@/lib/clipboard";
import { formatArtists } from "@/lib/format";
import { useMusicStore } from "@/stores/music";
import { useStatusStore } from "@/stores/status";
import { useSettingsStore } from "@/stores/settings";
import { useSiteDataStore } from "@/stores/siteData";
import { useIsTouch } from "@/platform/use-media-query";
import { addSong as ltAddSong } from "@/stores/listenTogether";
import {
  DropdownMenu,
  MenuItems,
  menuPopupClassName,
  type MenuItemDef,
} from "@/components/ui/menu";

interface SongListProps {
  songs: Song[];
  loading?: boolean;
  /** 列表获取出错(true 时显示错误占位,对照旧 SongList 的 data === "error" 分支) */
  error?: boolean;
  onPlayAll?: () => void;
  /** 是否显示专辑列(默认 true;专辑页内可关闭) */
  showAlbum?: boolean;
  /** 是否显示封面缩略图(默认 true) */
  showCover?: boolean;
  /** 序号偏移(分页时传 (page-1)*pageSize,仅影响序号展示) */
  indexOffset?: number;
  /** 模糊搜索关键词(fuzzySearch 本地过滤,空串/空白视为不过滤) */
  filterKeyword?: string;
  /** 列表触底回调(IntersectionObserver 哨兵,预留分页加载) */
  onReachEnd?: () => void;
  /**
   * 双击/立即播放的语义(对照旧 SongList.playSong 的特殊分支):
   * - "replace"(默认):整表替换播放列表并从被点击行播放;
   * - "insert":仅将当前曲插入到下一首并播放(addSongToNext(song, true)),
   *   不改动现有播放列表(旧 history 页 / search 页且未开启 playSearch 时的行为)。
   */
  playBehavior?: "replace" | "insert";
}

/** 播放行为(与 playBehavior prop 同型) */
type PlayBehavior = NonNullable<SongListProps["playBehavior"]>;

/** 歌手展示文本(空值兜底「未知歌手」) */
const artistsText = (artists: Song["artists"]): string =>
  formatArtists(artists) || "未知歌手";

/** 专辑展示文本(album 可能是对象或字符串) */
const albumText = (album: Song["album"]): string => {
  if (!album) return "未知专辑";
  return typeof album === "string" ? album : (album.name ?? "未知专辑");
};

/** 时长展示文本(duration 通常已是 "mm:ss",若为毫秒数则格式化) */
const durationText = (duration: Song["duration"]): string => {
  if (typeof duration === "number") return getSongTime(duration);
  return duration || "--:--";
};

/** 复制歌曲分享链接(对照旧 SongListDropdown 的「分享歌曲链接」) */
const copySongLink = (song: Song): Promise<void> =>
  copyText(`https://y.qq.com/n/ryqq/songDetail/${String(song.id)}`, "复制歌曲链接成功");

/** 歌曲 MV id(formatData 的 song.mv 字段;0 / "0" / 空值视为无 MV) */
const getMvId = (song: Song): string | null => {
  const mv = (song as { mv?: unknown }).mv;
  if (typeof mv === "number" && mv !== 0) return String(mv);
  if (typeof mv === "string" && mv !== "" && mv !== "0") return mv;
  return null;
};

/** 歌曲付费类型(formatData 的 song.fee 字段;1=VIP,4=EP 数字专辑) */
const getFee = (song: Song): number | null => {
  const fee = (song as { fee?: unknown }).fee;
  return typeof fee === "number" ? fee : null;
};

/** 歌曲是否带 TTML 逐词歌词标记(对照旧 tags-wrap 的 item.ttml === 1 判定) */
const hasTtml = (song: Song): boolean => (song as { ttml?: unknown }).ttml === 1;

/** 歌曲别名(formatData 的 song.alia 字段;对照旧 .alia 副行) */
const getAlia = (song: Song): string | null => {
  const alia = (song as { alia?: unknown }).alia;
  return typeof alia === "string" && alia !== "" ? alia : null;
};

/** 专辑 id(album 为对象且带 id 时可点击跳转专辑页) */
const getAlbumId = (album: Song["album"]): string | null => {
  if (album && typeof album === "object" && album.id != null) return String(album.id);
  return null;
};

/** 徽标基础样式(与 MV 标签一致的小圆角描边徽标) */
const tagBaseClassName =
  "shrink-0 rounded-full border px-1.5 text-[10px] leading-4";

/**
 * 列表定位播放(对照旧 SongList.vue 的 playSong 双击逻辑):
 * 整表设为播放列表,并从被点击行开始播放;再次操作当前播放行则切换播放/暂停。
 * 一起听房内(对齐旧 isInRoom 分支):不动本地播放列表,改为添加到共享队列。
 * behavior === "insert" 时(旧 history 页 / search 页且未开启 playSearch 的
 * 「仅播放当前歌曲」分支):addSongToNext(song, true) 插入下一首并播放,不整表替换。
 */
const playFromList = async (
  list: Song[],
  song: Song,
  index: number,
  behavior: PlayBehavior = "replace",
): Promise<void> => {
  // 若开启了缓存且正在加载(对照旧 playSong 首行):提示缓冲中并中止
  if (useSettingsStore.getState().useMusicCache && useStatusStore.getState().playLoading) {
    toast.warning("歌曲正在缓冲中,请稍后");
    return;
  }
  const playingId = useMusicStore.getState().playSongData?.id;
  if (playingId != null && playingId === song.id) {
    // 与旧实现一致:双击当前播放歌曲 → 播放/暂停切换(房内同样走此分支)
    fadePlayOrPause();
    return;
  }
  if (useStatusStore.getState().isInRoom) {
    ltAddSong(song);
    return;
  }
  if (behavior === "insert") {
    // 对照旧 playSong:addSongToNext(song, true) 后仍设 playSongData 并 initPlayer(true)
    useStatusStore.setState({ playMode: "normal" });
    addSongToNext(song, true);
    useMusicStore.setState({ playSongData: song });
    await initPlayer(true);
    return;
  }
  useStatusStore.setState({ playMode: "normal", playIndex: index });
  useMusicStore.setState({ playList: list.slice(), playSongData: song });
  await initPlayer(true);
};

/** 下一首播放(房内改为添加到一起听队列,对齐「房内一切歌曲操作入共享清单」语义) */
const addNext = (song: Song): void => {
  if (useStatusStore.getState().isInRoom) {
    ltAddSong(song);
    return;
  }
  useStatusStore.setState({ playMode: "normal" });
  addSongToNext(song);
};

/** 可复用歌曲列表 */
export default function SongList({
  songs,
  loading = false,
  error = false,
  onPlayAll,
  showAlbum = true,
  showCover = true,
  indexOffset = 0,
  filterKeyword,
  onReachEnd,
  playBehavior = "replace",
}: SongListProps) {
  const playingId = useMusicStore((s) => s.playSongData?.id);
  const isInRoom = useStatusStore((s) => s.isInRoom);
  /** 触屏设备:没有双击与 hover,行改为单击即播、行内操作常显 */
  const isTouch = useIsTouch();
  // 用户 VIP 类型(对照旧 userData.detail?.profile?.vipType;11 为黑胶 VIP,不再显示 VIP 徽标)
  const vipType = useSiteDataStore((s) => {
    const profile = (s.userData.detail as { profile?: { vipType?: unknown } }).profile;
    return typeof profile?.vipType === "number" ? profile.vipType : null;
  });
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const reachEndRef = useRef<SongListProps["onReachEnd"]>(onReachEnd);
  reachEndRef.current = onReachEnd;

  // 模糊搜索过滤(仅影响展示与定位播放的列表范围)
  const keyword = filterKeyword?.trim() ?? "";
  const displaySongs = useMemo<Song[]>(
    () => (keyword ? fuzzySearch(keyword, songs) : songs),
    [keyword, songs],
  );

  // 「定位歌曲」浮动按钮(对照旧 scroll-to-song):
  // 列表内含当前播放曲且其行不在视口内时显示,点击滚动至该行
  const hasPlayingRow =
    playingId != null && displaySongs.some((s) => s.id === playingId);
  const [playingRowVisible, setPlayingRowVisible] = useState(true);

  useEffect(() => {
    if (!hasPlayingRow) {
      setPlayingRowVisible(true);
      return;
    }
    const row = listRef.current?.querySelector<HTMLElement>('[data-playing="true"]');
    if (!row) {
      setPlayingRowVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setPlayingRowVisible(entries.some((e) => e.isIntersecting)),
      { threshold: 0.1 },
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, [hasPlayingRow, playingId, displaySongs]);

  const scrollToPlaying = (): void => {
    listRef.current
      ?.querySelector('[data-playing="true"]')
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  /**
   * 行操作菜单项(右键菜单与窄屏「⋯」按钮共用;对照旧 SongListDropdown 选项)。
   * 本地歌曲(song.path 存在)无线上 id,隐藏评论/详情/下载/复制链接。
   */
  const rowMenuItems = (song: Song, index: number): MenuItemDef[] => {
    const isLocalSong = !!song.path;
    const songId = String(song.id);
    const mvId = getMvId(song);
    const items: MenuItemDef[] = [
      {
        key: "play",
        label: "立即播放",
        onSelect: () => void playFromList(displaySongs, song, index, playBehavior),
      },
      {
        key: "next-play",
        label: "下一首播放",
        // 对照旧逻辑:当前播放歌曲不可再「下一首播放」;房内改为添加到一起听队列
        disabled: playingId != null && playingId === song.id,
        onSelect: () => addNext(song),
      },
    ];
    // 房内显式项(对照旧 SongListDropdown 的「添加到一起听歌」;不在房内隐藏)
    if (isInRoom) {
      items.push({
        key: "add-listen-together",
        label: "添加到一起听",
        onSelect: () => ltAddSong(song),
      });
    }
    if (mvId && !isLocalSong) {
      items.push({
        key: "mv",
        label: "观看 MV",
        onSelect: () => void navigate({ to: "/videos-player", search: { id: mvId } }),
      });
    }
    if (!isLocalSong) {
      items.push(
        {
          key: "comment",
          label: "查看评论",
          onSelect: () => void navigate({ to: "/comments", search: { id: songId } }),
        },
        {
          key: "song-detail",
          label: "查看单曲详情",
          onSelect: () => void navigate({ to: "/song", search: { id: songId } }),
        },
        {
          key: "download",
          label: "下载歌曲",
          // 对照旧 UrlDownloadSong:附带 music_quality=settings.songLevel(/download 路由已透传)
          onSelect: () =>
            void navigate({
              to: "/download",
              search: {
                id: songId,
                music_quality: useSettingsStore.getState().songLevel,
              },
            }),
        },
        {
          key: "share",
          label: "复制歌曲链接",
          onSelect: () => void copySongLink(song),
        },
        {
          key: "copy-id",
          label: "复制歌曲 ID",
          onSelect: () => void copyText(songId, "复制歌曲 ID 成功"),
        },
      );
    }
    // 同名搜索(对照旧 SongListDropdown,本地歌曲同样可用)
    items.push({
      key: "search-same-name",
      label: "同名搜索",
      onSelect: () =>
        void navigate({ to: "/search/songs", search: { keywords: song.name } }),
    });
    return items;
  };

  // 触底回调(预留分页)
  useEffect(() => {
    if (!onReachEnd || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) reachEndRef.current?.();
      },
      { rootMargin: "120px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onReachEnd, displaySongs.length]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--met-fg-dim)]">
        <span className="text-sm">列表获取出错,请重试</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2 py-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="flex h-14 animate-pulse items-center gap-3 rounded-lg bg-[var(--met-bg-elevated)] px-3"
          >
            <div className="h-10 w-10 rounded-md bg-[var(--met-border)]" />
            <div className="flex-1">
              <div className="mb-2 h-3 w-1/3 rounded bg-[var(--met-border)]" />
              <div className="h-2.5 w-1/5 rounded bg-[var(--met-border)]" />
            </div>
          </div>
        ))}
        <div className="py-2 text-center text-sm text-[var(--met-fg-dim)]">加载中…</div>
      </div>
    );
  }

  if (!songs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--met-fg-dim)]">
        <span className="text-sm">暂无歌曲</span>
      </div>
    );
  }

  if (keyword && !displaySongs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--met-fg-dim)]">
        <span className="text-sm">搜不到关于「{keyword}」的任何歌曲呀</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {onPlayAll ? (
        <div className="flex items-center gap-3 py-3">
          <button
            type="button"
            onClick={() => {
              // 房内禁止整表替换播放列表(engine.playAllSongs 已拒绝,此处显式提示)
              if (useStatusStore.getState().isInRoom) {
                toast.warning("一起听房间内暂不支持播放全部,请单曲添加到一起听队列");
                return;
              }
              onPlayAll();
            }}
            className="flex items-center gap-1.5 rounded-full bg-[var(--met-primary)] px-4 py-1.5 text-sm font-medium text-[var(--met-primary-fg)] transition-opacity hover:opacity-90"
          >
            <Play size={16} fill="currentColor" aria-hidden="true" />
            播放全部
          </button>
          <span className="text-xs text-[var(--met-fg-dim)]">共 {songs.length} 首</span>
        </div>
      ) : null}

      {/* 表头(对照旧 song-list-header;列宽/间距与行布局一致) */}
      <div className="flex items-center gap-3 border border-transparent px-3 pb-2 text-xs text-[var(--met-fg-dim)]">
        <span className="w-8 shrink-0 text-center">#</span>
        {showCover ? <span className="w-10 shrink-0" aria-hidden="true" /> : null}
        <span className="min-w-0 flex-1">歌曲</span>
        {showAlbum ? <span className="hidden w-1/4 min-w-0 sm:block">专辑</span> : null}
        {/* 悬停操作列占位(md+ 显示,与两个 h-8 w-8 按钮 + gap-0.5 等宽) */}
        <span className="hidden w-[66px] shrink-0 md:block" aria-hidden="true" />
        <span className="w-12 shrink-0 text-right">时长</span>
        {/* 「⋯」按钮占位(窄屏常驻;触屏在 md+ 也保留「⋯」,占位同步) */}
        <span
          className={`w-8 shrink-0 ${isTouch ? "" : "md:hidden"}`}
          aria-hidden="true"
        />
      </div>

      <ul ref={listRef} className="flex flex-col">
        {displaySongs.map((song, index) => {
          const isPlaying = playingId != null && playingId === song.id;
          const menuItems = rowMenuItems(song, index);
          const mvId = getMvId(song);
          const fee = getFee(song);
          /** 本行是否有任何标签(窄屏折行时,没标签就不渲染那一行,免得多出空隙) */
          const hasTags =
            hasTtml(song) || (fee === 1 && vipType !== 11) || fee === 4 || Boolean(mvId);
          const albumId = getAlbumId(song.album);
          return (
            <BaseContextMenu.Root key={`${song.id}-${index}`}>
              <BaseContextMenu.Trigger
                render={
                  <li
                    data-playing={isPlaying ? "true" : undefined}
                    onDoubleClick={() =>
                      void playFromList(displaySongs, song, index, playBehavior)
                    }
                    // 触屏没有双击语义(双击手势会被浏览器吃掉),改为单击即播。
                    // 行内的歌手/专辑/MV 等按钮各自 stopPropagation,但下拉菜单
                    // 触发器不会,故统一按「点在任何按钮/链接上就不算点行」放行。
                    onClick={
                      isTouch
                        ? (e) => {
                            if ((e.target as HTMLElement).closest("button, a")) return;
                            void playFromList(displaySongs, song, index, playBehavior);
                          }
                        : undefined
                    }
                    className={`group flex select-none items-center gap-3 rounded-lg border border-transparent px-3 py-2 transition-colors hover:bg-[var(--met-bg-elevated)] ${
                      isPlaying ? "border-[var(--met-border)] bg-[var(--met-bg-elevated)]" : ""
                    }`}
                  />
                }
              >
              {/* 序号 */}
              <span
                className={`w-8 shrink-0 text-center text-sm tabular-nums ${
                  isPlaying ? "text-[var(--met-primary)]" : "text-[var(--met-fg-dim)]"
                }`}
              >
                {indexOffset + index + 1}
              </span>
              {/* 封面缩略 */}
              {showCover ? (
                song.coverSize?.s ? (
                  <img
                    src={song.coverSize.s}
                    alt=""
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded-md bg-[var(--met-bg-elevated)] object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-md bg-[var(--met-bg-elevated)]" />
                )
              ) : null}
              {/* 歌名 / 歌手 */}
              <div className="min-w-0 flex-1">
                {/* 窄屏(手机竖屏)把标签折到歌名下一行:标签留在同一行会挤占歌名宽度,
                    歌名被截得只剩两三个字。md+ 用 display:contents 让标签容器透明,
                    还原成与原来完全一致的单行布局 */}
                <div className="flex min-w-0 flex-col gap-0.5 md:flex-row md:items-center md:gap-1.5">
                  <div
                    className={`truncate text-sm ${
                      isPlaying ? "text-[var(--met-primary)]" : "text-[var(--met-fg)]"
                    }`}
                    title={song.name}
                  >
                    {song.name}
                  </div>
                  {hasTags ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:contents">
                  {/* TTML 标签(对照旧 tags-wrap 的 item.ttml === 1,逐词歌词标记) */}
                  {hasTtml(song) ? (
                    <span
                      className={`${tagBaseClassName} border-[var(--met-fg-dim)] text-[var(--met-fg-dim)]`}
                    >
                      TTML
                    </span>
                  ) : null}
                  {/* VIP 标签(对照旧 tags-wrap:fee === 1 且用户非黑胶 VIP(vipType !== 11)时显示) */}
                  {fee === 1 && vipType !== 11 ? (
                    <span
                      className={`${tagBaseClassName} border-[var(--met-danger)] text-[var(--met-danger)]`}
                    >
                      VIP
                    </span>
                  ) : null}
                  {/* EP 标签(对照旧 tags-wrap:fee === 4,数字专辑) */}
                  {fee === 4 ? (
                    <span
                      className={`${tagBaseClassName} border-[var(--met-danger)] text-[var(--met-danger)]`}
                    >
                      EP
                    </span>
                  ) : null}
                  {/* MV 标签(对照旧 SongList 的 MV tag,点击跳转视频播放页) */}
                  {mvId ? (
                    <button
                      type="button"
                      title="观看 MV"
                      className="shrink-0 cursor-pointer rounded-full border border-[var(--met-primary)] px-1.5 text-[10px] leading-4 text-[var(--met-primary)] transition-colors hover:bg-[var(--met-bg-hover)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        void navigate({ to: "/videos-player", search: { id: mvId } });
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      MV
                    </button>
                  ) : null}
                  </div>
                  ) : null}
                </div>
                {/* 歌手(对照旧 .artist:数组时逐个可点跳转 /artist?id=,"/" 分隔) */}
                <div className="truncate text-xs text-[var(--met-fg-dim)]">
                  {Array.isArray(song.artists) && song.artists.length ? (
                    song.artists.map((ar, arIndex) => (
                      <span key={`${ar.id ?? ar.name}-${arIndex}`}>
                        {arIndex > 0 ? <span aria-hidden="true"> / </span> : null}
                        {ar.id != null ? (
                          <button
                            type="button"
                            title={`查看歌手 ${ar.name}`}
                            className="cursor-pointer transition-colors hover:text-[var(--met-primary)]"
                            onClick={(e) => {
                              e.stopPropagation();
                              void navigate({
                                to: "/artist",
                                search: { id: String(ar.id) },
                              });
                            }}
                            onDoubleClick={(e) => e.stopPropagation()}
                          >
                            {ar.name}
                          </button>
                        ) : (
                          ar.name
                        )}
                      </span>
                    ))
                  ) : (
                    artistsText(song.artists)
                  )}
                </div>
                {/* 别名副行(对照旧 .alia:song.alia 存在时歌名下灰色小字) */}
                {getAlia(song) ? (
                  <div
                    className="truncate text-[11px] text-[var(--met-fg-dim)] opacity-70"
                    title={getAlia(song) ?? undefined}
                  >
                    {getAlia(song)}
                  </div>
                ) : null}
              </div>
              {/* 专辑(对照旧 .album:album 为对象且带 id 时可点跳转 /album?id=) */}
              {showAlbum ? (
                <div className="hidden w-1/4 min-w-0 truncate text-xs text-[var(--met-fg-dim)] sm:block">
                  {albumId ? (
                    <button
                      type="button"
                      title={`查看专辑 ${albumText(song.album)}`}
                      className="max-w-full cursor-pointer truncate text-left transition-colors hover:text-[var(--met-primary)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        void navigate({ to: "/album", search: { id: albumId } });
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      {albumText(song.album)}
                    </button>
                  ) : (
                    albumText(song.album)
                  )}
                </div>
              ) : null}
              {/* 悬停操作:立即播放 / 下一首播放(窄屏隐藏,由行尾「⋯」菜单承接) */}
              <div className="hidden shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 coarse:opacity-100 md:flex">
                <button
                  type="button"
                  aria-label={isInRoom ? `添加到一起听 ${song.name}` : `播放 ${song.name}`}
                  title={isInRoom ? "添加到一起听" : "立即播放"}
                  onClick={() => void playFromList(displaySongs, song, index, playBehavior)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)]"
                >
                  <Play size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={
                    isInRoom ? `添加到一起听 ${song.name}` : `下一首播放 ${song.name}`
                  }
                  title={isInRoom ? "添加到一起听" : "下一首播放"}
                  onClick={() => addNext(song)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)]"
                >
                  <ListEnd size={18} aria-hidden="true" />
                </button>
              </div>
              {/* 时长 */}
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-[var(--met-fg-dim)]">
                {durationText(song.duration)}
              </span>
              {/* 窄屏「⋯」菜单(<768px 无右键场景;与右键菜单同组操作) */}
              <DropdownMenu
                items={menuItems}
                side="bottom"
                align="end"
                ariaLabel={`${song.name} 更多操作`}
                title="更多操作"
                triggerClassName={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-transparent text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)] ${
                  // 触屏在 md+ 也保留「⋯」:那里既没有右键菜单也没有 hover 行内按钮
                  isTouch ? "" : "md:hidden"
                }`}
              >
                <Ellipsis size={18} aria-hidden="true" />
              </DropdownMenu>
              </BaseContextMenu.Trigger>
              <BaseContextMenu.Portal>
                <BaseContextMenu.Positioner className="z-50 outline-none">
                  <BaseContextMenu.Popup className={menuPopupClassName}>
                    {/* 顶部歌曲信息头(对照旧 SongListDropdown renderSong;不可点,本地歌曲不显示) */}
                    {!song.path ? (
                      <>
                        <div className="flex max-w-64 items-center gap-2.5 px-3 py-2">
                          {song.coverSize?.s || song.cover ? (
                            <img
                              src={song.coverSize?.s || song.cover}
                              alt=""
                              loading="lazy"
                              className="h-10 w-10 shrink-0 rounded-md bg-[var(--met-bg)] object-cover"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[var(--met-fg)]">
                              {song.name || "未知曲目"}
                            </div>
                            <div className="truncate text-xs text-[var(--met-fg-dim)]">
                              {artistsText(song.artists)}
                            </div>
                          </div>
                        </div>
                        <div className="mx-2 mb-1 h-px bg-[var(--met-border)]" aria-hidden="true" />
                      </>
                    ) : null}
                    <MenuItems items={menuItems} />
                  </BaseContextMenu.Popup>
                </BaseContextMenu.Positioner>
              </BaseContextMenu.Portal>
            </BaseContextMenu.Root>
          );
        })}
      </ul>

      {/* 「定位歌曲」浮动按钮(对照旧 scroll-to-song:当前播放行不在视口时显示) */}
      {hasPlayingRow && !playingRowVisible ? (
        <button
          type="button"
          aria-label="定位歌曲"
          title="定位歌曲"
          onClick={scrollToPlaying}
          className="fixed right-6 bottom-[144px] z-30 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[var(--met-border)] bg-[var(--met-bg-elevated)] text-[var(--met-fg)] shadow-lg transition-colors hover:text-[var(--met-primary)] active:scale-95"
        >
          <Locate size={20} aria-hidden="true" />
        </button>
      ) : null}

      {/* 触底哨兵 */}
      {onReachEnd ? <div ref={sentinelRef} className="h-px w-full" /> : null}
    </div>
  );
}
