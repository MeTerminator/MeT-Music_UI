/** 主页(对照旧 src/views/Home.vue:标题 + 声明;另加最近播放快捷入口) */
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { getGreetings, type Song } from "@met/core";
import { useMusicStore } from "@/stores/music";
import { formatArtists, getCoverUrl } from "@/lib/format";

/** 歌手展示文本(空值兜底「未知歌手」) */
const artistsText = (artists: Song["artists"]): string =>
  formatArtists(artists) || "未知歌手";

const Home = () => {
  const navigate = useNavigate();
  const historyPlaylist = useMusicStore((s) => s.historyPlaylist);
  const recentSongs = historyPlaylist.slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-8 max-md:px-4">
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
              className="flex cursor-pointer items-center gap-1 text-xs text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)]"
            >
              查看全部
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recentSongs.map((song) => {
              const cover = getCoverUrl(song, "s");
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
