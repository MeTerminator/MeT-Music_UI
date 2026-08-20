/** 主页(对照旧 src/views/Home.vue:标题 + 声明;另加最近播放快捷入口) */
import { useNavigate } from "@tanstack/react-router";
import { getGreetings, type Artist, type Song } from "@met/core";
import { useMusicStore } from "@/stores/music";

/** 歌手展示文本(artists 可能是数组或字符串) */
const artistsText = (artists: Song["artists"]): string => {
  if (!artists) return "未知歌手";
  if (typeof artists === "string") return artists;
  return artists.map((a: Artist) => a?.name).filter(Boolean).join(" / ") || "未知歌手";
};

/** 封面缩略地址 */
const coverUrl = (song: Song): string | undefined =>
  song.coverSize?.s ?? song.coverSize?.m ?? song.cover ?? song.localCover;

const Home = () => {
  const navigate = useNavigate();
  const historyPlaylist = useMusicStore((s) => s.historyPlaylist);
  const recentSongs = historyPlaylist.slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      {/* 问候语 */}
      <h1 className="text-3xl font-bold text-[var(--met-fg)]">{getGreetings()}</h1>

      {/* 旧版声明 */}
      <div className="mt-6">
        <h2 className="text-xl font-semibold text-[var(--met-fg)]">MeT-Music</h2>
        <p className="mt-1 text-sm text-[var(--met-fg-dim)]">
          仅供学习交流使用, 严禁用于商业用途.
        </p>
      </div>

      {/* 最近播放快捷入口 */}
      {recentSongs.length > 0 ? (
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--met-fg)]">最近播放</h2>
            <button
              type="button"
              onClick={() => navigate({ to: "/history" })}
              className="cursor-pointer text-xs text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)]"
            >
              查看全部 →
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recentSongs.map((song) => {
              const cover = coverUrl(song);
              return (
                <button
                  key={String(song.id)}
                  type="button"
                  onClick={() => navigate({ to: "/history" })}
                  className="flex items-center gap-3 rounded-xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] px-3 py-2 text-left transition-colors hover:border-[var(--met-primary)]"
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      className="h-10 w-10 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="h-10 w-10 shrink-0 rounded-md bg-[var(--met-bg)]" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[var(--met-fg)]">
                      {song.name}
                    </span>
                    <span className="block truncate text-xs text-[var(--met-fg-dim)]">
                      {artistsText(song.artists)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default Home;
