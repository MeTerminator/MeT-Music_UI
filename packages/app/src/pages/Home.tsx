/**
 * 主页(Apple Music 首页风):问候语 + 最近播放横滑歌曲卡 + 我的歌单横滑卡。
 * 歌曲卡点击即播(一起听房内投共享队列);歌单卡点击进详情,hover 出播放全部钮
 * (卡片结构对照 search/Playlists.tsx 保持全站一致)。
 */
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Play } from "lucide-react";
import { addSongToNext, getGreetings, type Song } from "@met/core";
import { useMusicStore } from "@/stores/music";
import { useSiteDataStore } from "@/stores/siteData";
import { useStatusStore } from "@/stores/status";
import { addSong as ltAddSong } from "@/stores/listenTogether";
import { formatArtists, getCoverUrl as songCoverUrl } from "@/lib/format";
import { getCoverUrl as picCoverUrl } from "@/lib/formatData";
import CoverPlayButton from "@/components/cover/CoverPlayButton";

/** 侧栏同源的用户歌单原始字段 */
interface RawUserPlaylist {
  id: number | string;
  name: string;
  coverImgUrl?: string;
}

/** 歌手展示文本(空值兜底「未知歌手」) */
const artistsText = (artists: Song["artists"]): string =>
  formatArtists(artists) || "未知歌手";

/** 区块标题行:标题 + 可选「查看全部」 */
const SectionHeader = ({ title, onMore }: { title: string; onMore?: () => void }) => (
  <div className="mb-3 flex items-end justify-between">
    <h2 className="text-lg font-semibold text-[var(--met-fg)]">{title}</h2>
    {onMore ? (
      <button
        type="button"
        onClick={onMore}
        className="flex cursor-pointer items-center gap-1 text-xs text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)]"
      >
        查看全部
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    ) : null}
  </div>
);

/** 横滑行容器(隐藏滚动条 + snap) */
const rowCls =
  "flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const Home = () => {
  const navigate = useNavigate();
  const historyPlaylist = useMusicStore((s) => s.historyPlaylist);
  const userLoginStatus = useSiteDataStore((s) => s.userLoginStatus);
  const playlists = useSiteDataStore(
    (s) => s.userLikeData.playlists,
  ) as RawUserPlaylist[];

  const recentSongs = historyPlaylist.slice(0, 12);

  // 歌曲卡点击即播(对齐房内语义:投共享队列而非本地播放)
  const playSong = (song: Song) => {
    if (useStatusStore.getState().isInRoom) {
      ltAddSong(song);
    } else {
      addSongToNext(song, true);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-8 max-md:px-4">
      {/* 问候语 */}
      <h1 className="text-3xl font-bold text-[var(--met-fg)]">{getGreetings()}</h1>
      <p className="mt-1 text-sm text-[var(--met-fg-dim)]">
        MeT-Music · 仅供学习交流使用, 严禁用于商业用途.
      </p>

      {/* 最近播放:横滑歌曲卡,点击即播 */}
      {recentSongs.length > 0 ? (
        <section className="mt-8">
          <SectionHeader title="最近播放" onMore={() => navigate({ to: "/history" })} />
          <div className={rowCls}>
            {recentSongs.map((song) => {
              const cover = songCoverUrl(song, "m") || songCoverUrl(song, "s");
              return (
                <button
                  key={String(song.id)}
                  type="button"
                  title={`播放「${song.name}」`}
                  onClick={() => playSong(song)}
                  className="group w-36 shrink-0 cursor-pointer snap-start text-left"
                >
                  <span className="relative block aspect-square overflow-hidden rounded-xl bg-[var(--met-bg-elevated)]">
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : null}
                    {/* hover 播放浮层 */}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-md">
                        <Play size={16} fill="currentColor" aria-hidden="true" />
                      </span>
                    </span>
                  </span>
                  <span className="mt-2 block truncate text-sm text-[var(--met-fg)] group-hover:text-[var(--met-primary)]">
                    {song.name}
                  </span>
                  <span className="block truncate text-xs text-[var(--met-fg-dim)]">
                    {artistsText(song.artists)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* 我的歌单:登录后展示(含「我喜欢」),点击进详情,hover 播放全部 */}
      {userLoginStatus && playlists.length > 0 ? (
        <section className="mt-8">
          <SectionHeader title="我的歌单" />
          <div className={rowCls}>
            {playlists.map((pl) => (
              <div key={String(pl.id)} className="group relative w-36 shrink-0 snap-start">
                <button
                  type="button"
                  onClick={() =>
                    navigate({ to: "/playlist", search: { id: String(pl.id) } })
                  }
                  className="flex w-full cursor-pointer flex-col text-left"
                >
                  <span className="relative block aspect-square w-full overflow-hidden rounded-xl bg-[var(--met-bg-elevated)]">
                    {pl.coverImgUrl ? (
                      <img
                        src={picCoverUrl(pl.coverImgUrl, 300)}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : null}
                  </span>
                  <span
                    className="mt-2 truncate text-sm text-[var(--met-fg)] group-hover:text-[var(--met-primary)]"
                    title={pl.name}
                  >
                    {pl.name}
                  </span>
                </button>
                {/* hover 播放全部(卡片兄弟层叠,点击不冒泡跳详情) */}
                <div className="pointer-events-none absolute inset-x-0 top-0 flex aspect-square items-center justify-center">
                  <CoverPlayButton id={pl.id} type="playlist" className="pointer-events-auto" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default Home;
