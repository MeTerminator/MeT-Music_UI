import { addSongToNext, type Song } from "@met/core";
import { useMusicStore } from "@/stores/music";

/** 歌手字段兼容(Artist[] | string) */
const artistNames = (artists: Song["artists"]): string => {
  if (Array.isArray(artists)) return artists.map((ar) => ar.name).join(" / ");
  return artists || "未知歌手";
};

/** 封面缩略地址(在线多尺寸 / 单地址 / 本地封面) */
const coverUrl = (song: Song): string | undefined =>
  song.coverSize?.s ?? song.coverSize?.m ?? song.cover ?? song.localCover;

/** 最近播放:展示 historyPlaylist,点击行插入下一首并播放 */
const History = () => {
  const historyPlaylist = useMusicStore((s) => s.historyPlaylist);

  if (historyPlaylist.length === 0) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2">
        <p className="text-lg font-medium text-[var(--met-fg)]">暂无播放记录</p>
        <p className="text-sm text-[var(--met-fg-dim)]">播放过的歌曲会出现在这里</p>
      </div>
    );
  }

  return (
    <div className="px-8 py-8">
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-[var(--met-fg)]">最近播放</h1>
        <span className="text-sm text-[var(--met-fg-dim)]">共 {historyPlaylist.length} 首</span>
      </div>
      <ul className="flex flex-col">
        {historyPlaylist.map((song) => {
          const cover = coverUrl(song);
          return (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => addSongToNext(song, true)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--met-bg-elevated)]"
              >
                {cover ? (
                  <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    className="h-11 w-11 shrink-0 rounded-md border border-[var(--met-border)] object-cover"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[var(--met-border)] bg-[var(--met-bg-elevated)] text-xs text-[var(--met-fg-dim)]">
                    无封面
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[var(--met-fg)]">{song.name}</span>
                  <span className="block truncate text-xs text-[var(--met-fg-dim)]">
                    {artistNames(song.artists)}
                  </span>
                </span>
                {typeof song.duration === "string" ? (
                  <span className="shrink-0 text-xs tabular-nums text-[var(--met-fg-dim)]">
                    {song.duration}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default History;
