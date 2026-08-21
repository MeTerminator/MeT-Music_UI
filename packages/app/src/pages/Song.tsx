import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { Download as DownloadIcon, Music } from "lucide-react";
import {
  addSongToNext,
  api,
  fadePlayOrPause,
  getSongPlayTime,
  initPlayer,
  type Song,
} from "@met/core";
import { addSong as ltAddSong } from "@/stores/listenTogether";
import { useMusicStore } from "@/stores/music";
import { useSettingsStore } from "@/stores/settings";
import { useStatusStore } from "@/stores/status";

/** QQ 封面地址(pmid → photo_new 规格图) */
const qqCoverUrl = (pmid: string | undefined, size: number): string | undefined =>
  pmid ? `https://y.qq.com/music/photo_new/T002R${size}x${size}M000${pmid}.jpg` : undefined;

/** 由 track_info 构造播放器所需的 Song 结构(对照旧 SongDetail.vue handlePlay) */
// 原始接口字段访问豁免点
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildSong = (track: any): Song => ({
  id: track.mid,
  mid: track.mid,
  name: track.name || track.title,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  artists: (track.singer ?? []).map((s: any) => ({ id: s.mid, mid: s.mid, name: s.name })),
  album: { id: track.album?.mid, name: track.album?.name || track.album?.title || "未知专辑" },
  duration: getSongPlayTime(track.interval),
  cover: qqCoverUrl(track.album?.pmid, 800),
  coverSize: {
    s: qqCoverUrl(track.album?.pmid, 300),
    m: qqCoverUrl(track.album?.pmid, 500),
    l: qqCoverUrl(track.album?.pmid, 800),
  },
});

/** 详情网格条目(对照旧 SongDetail.vue displayInfo) */
interface InfoField {
  title: string;
  values: string[];
}

/**
 * 由原始 info 对象构造详情条目(旧 displayInfo:遍历 info,
 * 每项 { title, content: [{ value }] })。
 */
// 原始接口字段访问豁免点
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildInfoFields = (info: any): InfoField[] => {
  if (info == null || typeof info !== "object") return [];
  return Object.keys(info)
    .map((key) => {
      const item = info[key];
      const content = Array.isArray(item?.content) ? item.content : [];
      return {
        title: String(item?.title ?? key),
        values: content
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((c: any) => (c?.value == null ? "" : String(c.value)))
          .filter(Boolean),
      };
    })
    .filter((item) => item.title);
};

/** 歌曲详情页(对照旧 views/SongDetail.vue;数据源改为 api.getMusicInfo) */
export default function SongDetail() {
  const search = useSearch({ strict: false }) as { id?: string };
  const id = search.id;
  const songLevel = useSettingsStore((s) => s.songLevel);
  const isInRoom = useStatusStore((s) => s.isInRoom);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["song", "info", id],
    queryFn: () => api.getMusicInfo(id as number | string),
    enabled: id != null && id !== "",
  });

  // 详情补充源(旧页数据源 getMusicUrl 的 data[0].info / extras;容错:失败仅少详情网格)
  const urlInfoQuery = useQuery({
    queryKey: ["song", "url-info", id, songLevel],
    queryFn: () => api.getMusicUrl(id as string, songLevel.toUpperCase()),
    enabled: id != null && id !== "",
    retry: 0,
  });

  // 原始接口字段访问豁免点(响应形如 { [mid]: { track_info, info } })
  const raw = data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const entry = raw?.[String(id)] ?? null;
  const track = entry?.track_info ?? null;

  // 旧页 getMusicUrl 消费方式:const data = res.data || res; data[0]
  const urlRaw = urlInfoQuery.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const urlEntry = (urlRaw?.data || urlRaw)?.[0] ?? null;

  // info / 译名:优先 getMusicInfo 响应内的等价字段,否则回退 getMusicUrl
  const infoSource = entry?.info ?? urlEntry?.info ?? null;
  const transname: string =
    entry?.extras?.transname || urlEntry?.extras?.transname || "";

  const infoFields = useMemo<InfoField[]>(() => buildInfoFields(infoSource), [infoSource]);

  const song = useMemo<Song | null>(() => (track ? buildSong(track) : null), [track]);

  // 大图预览:Escape 关闭
  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);

  // 当前播放歌曲为该 id 时,用 store 歌词做文本预览
  const playingId = useMusicStore((s) => s.playSongData?.id);
  const lyric = useMusicStore((s) => s.playSongLyric);
  const isCurrent = song != null && playingId != null && playingId === song.id;
  const lrcLines = isCurrent ? lyric.lrc : [];

  const handlePlay = async (): Promise<void> => {
    if (!song) return;
    // 房内分支(对照旧 handlePlay / SongList 语义):当前歌曲切播暂停,否则入共享队列
    if (useStatusStore.getState().isInRoom) {
      if (useMusicStore.getState().playSongData?.id === song.id) {
        fadePlayOrPause();
      } else {
        ltAddSong(song);
      }
      return;
    }
    addSongToNext(song, true);
    useMusicStore.setState({ playSongData: song });
    await initPlayer(true);
  };

  /** 下一首播放(房内同 SongList 语义:改为添加到共享队列) */
  const handleAddNext = (): void => {
    if (!song) return;
    if (useStatusStore.getState().isInRoom) {
      ltAddSong(song);
      return;
    }
    addSongToNext(song);
  };

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

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl animate-pulse gap-6 px-4 py-8">
        <div className="h-56 w-56 shrink-0 rounded-2xl bg-[var(--met-bg-elevated)]" />
        <div className="flex flex-1 flex-col justify-center gap-3">
          <div className="h-6 w-1/2 rounded bg-[var(--met-bg-elevated)]" />
          <div className="h-3 w-1/3 rounded bg-[var(--met-bg-elevated)]" />
          <div className="h-3 w-1/4 rounded bg-[var(--met-bg-elevated)]" />
        </div>
      </div>
    );
  }

  if (isError || !track || !song) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2">
        <p className="text-lg font-semibold text-[var(--met-fg)]">未找到歌曲信息</p>
        <p className="text-sm text-[var(--met-fg-dim)]">该歌曲可能已下架或链接失效</p>
        <button
          type="button"
          onClick={() => history.back()}
          className="mt-2 rounded-full border border-[var(--met-border)] px-4 py-1.5 text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)]"
        >
          返回上一页
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-4 py-8">
      {/* 信息卡 */}
      <div className="flex flex-col gap-6 sm:flex-row">
        {/* 封面(点击开大图预览,替代旧 n-image preview) */}
        {song.coverSize?.l ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            aria-label="查看封面大图"
            title="查看封面大图"
            className="h-56 w-56 shrink-0 cursor-zoom-in rounded-2xl"
          >
            <img
              src={song.coverSize.l}
              alt=""
              className="h-full w-full rounded-2xl bg-[var(--met-bg-elevated)] object-cover shadow-lg"
            />
          </button>
        ) : (
          <div className="flex h-56 w-56 shrink-0 items-center justify-center rounded-2xl bg-[var(--met-bg-elevated)] text-4xl text-[var(--met-fg-dim)]">
            <Music size={40} aria-hidden="true" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
          {/* 名称(含译名副标题,对照旧 extras.transname) */}
          <h1 className="text-2xl font-semibold text-[var(--met-fg)]">
            {song.name || "未知曲目"}
            {transname ? (
              <span className="ml-2 text-base font-normal text-[var(--met-fg-dim)]">
                ({transname})
              </span>
            ) : null}
          </h1>
          {/* 歌手 */}
          <div className="flex flex-wrap items-center gap-1 text-sm text-[var(--met-fg-dim)]">
            <span className="mr-1">歌手:</span>
            {Array.isArray(song.artists) && song.artists.length ? (
              song.artists.map((ar, i) => (
                <span key={`${ar.id}-${i}`} className="flex items-center">
                  <Link
                    to="/artist"
                    search={{ id: ar.id != null ? String(ar.id) : undefined }}
                    className="transition-colors hover:text-[var(--met-primary)]"
                  >
                    {ar.name}
                  </Link>
                  {i < (song.artists as { name: string }[]).length - 1 ? (
                    <span className="mx-1">/</span>
                  ) : null}
                </span>
              ))
            ) : (
              <span>未知歌手</span>
            )}
          </div>
          {/* 专辑链接 */}
          <div className="flex items-center gap-1 text-sm text-[var(--met-fg-dim)]">
            <span className="mr-1">专辑:</span>
            {typeof song.album === "object" && song.album?.id ? (
              <Link
                to="/album"
                search={{ id: String(song.album.id) }}
                className="truncate transition-colors hover:text-[var(--met-primary)]"
              >
                {song.album.name}
              </Link>
            ) : (
              <span>未知专辑</span>
            )}
          </div>
          {/* 时长 */}
          <div className="text-sm text-[var(--met-fg-dim)]">时长: {song.duration}</div>
          {/* 操作 */}
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handlePlay()}
              className="flex items-center gap-1.5 rounded-full bg-[var(--met-primary)] px-5 py-2 text-sm font-medium text-[var(--met-primary-fg)] transition-opacity hover:opacity-90"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              立即播放
            </button>
            <button
              type="button"
              onClick={handleAddNext}
              title={isInRoom ? "添加到一起听" : "下一首播放"}
              className="rounded-full border border-[var(--met-border)] px-5 py-2 text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)]"
            >
              {isInRoom ? "添加到一起听" : "下一首播放"}
            </button>
            <Link
              to="/download"
              search={{ id, music_quality: songLevel }}
              className="flex items-center gap-1.5 rounded-full border border-[var(--met-border)] px-5 py-2 text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)]"
            >
              <DownloadIcon size={14} aria-hidden="true" />
              下载歌曲
            </Link>
            <Link
              to="/comments"
              search={{ id }}
              className="rounded-full border border-[var(--met-border)] px-5 py-2 text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)]"
            >
              查看评论
            </Link>
          </div>
        </div>
      </div>

      {/* 详细信息网格(对照旧 details-grid;数据源 info,失败时静默省略) */}
      {infoFields.length ? (
        <div className="mt-8">
          <h2 className="mb-3 text-base font-semibold text-[var(--met-fg)]">详细信息</h2>
          <div className="flex flex-col gap-4 rounded-xl bg-[var(--met-bg-elevated)] p-4">
            {infoFields.map((item, i) => (
              <div key={`${item.title}-${i}`} className="min-w-0">
                <div className="mb-1 text-sm font-semibold text-[var(--met-fg-dim)]">
                  {item.title}
                </div>
                <div className="text-sm leading-relaxed break-words whitespace-pre-wrap text-[var(--met-fg)]">
                  {item.values.length ? (
                    item.values.map((value, j) => (
                      <span key={j}>
                        {value}
                        {j < item.values.length - 1 ? (
                          <span className="mx-1 opacity-50">/</span>
                        ) : null}
                      </span>
                    ))
                  ) : (
                    <span className="text-[var(--met-fg-dim)]">暂无数据</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 歌词预览 */}
      <div className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-[var(--met-fg)]">歌词预览</h2>
        {isCurrent && lrcLines.length ? (
          <div className="max-h-80 overflow-y-auto rounded-xl bg-[var(--met-bg-elevated)] p-4">
            {lrcLines.map((line, i) => (
              <p key={`${line.time}-${i}`} className="py-1 text-sm leading-relaxed text-[var(--met-fg-dim)]">
                {line.content}
              </p>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-[var(--met-bg-elevated)] p-6 text-center text-sm text-[var(--met-fg-dim)]">
            {isCurrent ? "当前歌曲暂无歌词" : "播放该歌曲后可在此查看歌词"}
          </div>
        )}
      </div>

      {/* 封面大图预览(简易 Lightbox,点击任意处或 Escape 关闭) */}
      {previewOpen && song.coverSize?.l ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="封面大图预览"
          onClick={() => setPreviewOpen(false)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
        >
          <img
            src={song.coverSize.l}
            alt=""
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
          />
        </div>
      ) : null}
    </div>
  );
}
