/**
 * 发现页封面轮播:最近播放去重取前 8 首,大图横幅自动轮换
 * (4.5s,hover 暂停),点击即播(房内投一起听共享队列)。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Play } from "lucide-react";
import { addSongToNext, type Song } from "@met/core";
import { formatArtists, getCoverUrl } from "@/lib/format";
import { addSong as ltAddSong } from "@/stores/listenTogether";
import { useMusicStore } from "@/stores/music";
import { useStatusStore } from "@/stores/status";

const SLIDE_MS = 4500;
const MAX_SLIDES = 8;

export default function CoverCarousel() {
  const historyPlaylist = useMusicStore((s) => s.historyPlaylist);

  // 有封面的最近播放,按歌曲 id 去重取前 8
  const slides = useMemo(() => {
    const seen = new Set<string>();
    const list: { song: Song; cover: string }[] = [];
    for (const song of historyPlaylist) {
      const cover = getCoverUrl(song, "l") || getCoverUrl(song, "m");
      const key = String(song.id);
      if (!cover || seen.has(key)) continue;
      seen.add(key);
      list.push({ song, cover });
      if (list.length >= MAX_SLIDES) break;
    }
    return list;
  }, [historyPlaylist]);

  const [index, setIndex] = useState(0);
  const hoverRef = useRef(false);

  // 自动轮换(hover 暂停);slides 数量变化时归位防越界
  useEffect(() => {
    if (slides.length < 2) return;
    const timer = window.setInterval(() => {
      if (!hoverRef.current) setIndex((i) => (i + 1) % slides.length);
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [slides.length]);
  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [index, slides.length]);

  const playSlide = (song: Song) => {
    if (useStatusStore.getState().isInRoom) {
      ltAddSong(song);
    } else {
      addSongToNext(song, true);
    }
  };

  if (slides.length === 0) return null;

  return (
    <div
      className="relative mt-4 h-48 overflow-hidden rounded-2xl md:h-56"
      onMouseEnter={() => {
        hoverRef.current = true;
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
      }}
    >
      <div
        className="flex h-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map(({ song, cover }) => (
          <button
            key={song.id}
            type="button"
            title={`播放「${song.name}」`}
            onClick={() => playSlide(song)}
            className="group relative h-full w-full shrink-0 cursor-pointer overflow-hidden text-left"
          >
            {/* 背景:封面放大模糊铺满,前景:原图方卡 + 信息 */}
            <img
              src={cover}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-black/45" />
            <div className="relative flex h-full items-center gap-5 px-6 md:px-8">
              <img
                src={cover}
                alt=""
                className="h-32 w-32 shrink-0 rounded-xl object-cover shadow-2xl transition-transform duration-500 group-hover:scale-105 md:h-40 md:w-40"
              />
              <div className="min-w-0 flex-1 text-white">
                <div className="text-xs font-medium tracking-widest text-white/60">
                  最近在听
                </div>
                <div className="mt-1 truncate text-xl font-bold md:text-2xl">{song.name}</div>
                <div className="mt-1 truncate text-sm text-white/70">
                  {formatArtists(song.artists)}
                </div>
              </div>
              <span
                aria-hidden
                className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur-md transition-all duration-300 group-hover:opacity-100"
              >
                <Play size={18} fill="currentColor" />
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* 圆点指示器 */}
      {slides.length > 1 && (
        <div className="absolute right-5 bottom-4 flex items-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.song.id}
              type="button"
              aria-label={`第 ${i + 1} 张`}
              onClick={() => setIndex(i)}
              className={`h-1.5 cursor-pointer rounded-full transition-all duration-300 ${
                i === index ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
