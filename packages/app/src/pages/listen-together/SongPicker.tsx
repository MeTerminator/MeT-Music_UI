import { useState } from "react";
import { toast } from "sonner";
import { api, type Song } from "@met/core";
import formatData from "@/lib/formatData";
import { addSong } from "@/stores/listenTogether";
import { Button } from "@/components/ui/button";
import { fallbackImg, formatArtist, songCover } from "./shared";

/**
 * 房内点歌(React 版新增便捷入口;旧页依赖应用内右键“添加到一起听歌”):
 * 搜索单曲(getSearchRes type=1)→ formatData 规范化 → 点击结果行 addSong。
 */
const SongPicker = () => {
  const [keyword, setKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<Song[]>([]);

  const handleSearch = async (): Promise<void> => {
    const kw = keyword.trim();
    if (!kw || searching) return;
    try {
      setSearching(true);
      // API 响应无稳定 schema,集中豁免
      const res = (await api.getSearchRes(kw, 30, 0, 1)) as any;
      setResults(formatData(res?.result?.songs, "song") ?? []);
      setSearched(true);
    } catch (err) {
      console.error("搜索歌曲出错:", err);
      toast.error("搜索歌曲出错，请稍后重试");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)]">
      <div className="border-b border-[var(--met-border)] px-5 py-3.5 text-base font-semibold text-[var(--met-fg)]">
        点歌
        <span className="ml-2 text-xs font-normal text-[var(--met-fg-dim)]">
          搜索单曲并添加到共享播放列表
        </span>
      </div>

      <div className="flex items-center gap-2 p-3">
        <input
          type="text"
          value={keyword}
          placeholder="搜索歌曲 / 歌手"
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSearch();
          }}
          className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--met-border)] bg-[var(--met-bg)] px-3 text-sm text-[var(--met-fg)] outline-none placeholder:text-[var(--met-fg-dim)] focus:border-[var(--met-primary)]"
        />
        <Button
          variant="primary"
          size="sm"
          disabled={searching || !keyword.trim()}
          onClick={() => void handleSearch()}
        >
          {searching ? "搜索中…" : "搜索"}
        </Button>
      </div>

      {searched && (
        <div className="border-t border-[var(--met-border)] p-3">
          {results.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--met-fg-dim)]">
              没有找到相关歌曲
            </p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {results.map((song) => (
                <li key={song.id}>
                  <button
                    type="button"
                    title="添加到共享播放列表"
                    onClick={() => addSong(song)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--met-bg-hover)]"
                  >
                    <img
                      src={songCover(song)}
                      alt=""
                      loading="lazy"
                      onError={fallbackImg("/images/pic/song.jpg")}
                      className="h-9 w-9 shrink-0 rounded-md border border-[var(--met-border)] object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-[var(--met-fg)]">
                        {song.name}
                      </span>
                      <span className="block truncate text-xs text-[var(--met-fg-dim)]">
                        {formatArtist(song.artists)}
                      </span>
                    </span>
                    {typeof song.duration === "string" && (
                      <span className="shrink-0 text-xs text-[var(--met-fg-dim)]">
                        {song.duration}
                      </span>
                    )}
                    <span className="shrink-0 text-sm text-[var(--met-primary)]">＋</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default SongPicker;
