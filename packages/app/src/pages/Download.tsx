/**
 * 歌曲下载页(对照旧 src/views/Download.vue,web 能力内实现):
 * - 数据源:?id= 参数优先,否则取当前播放歌曲;api.getMusicInfo 展示歌曲卡
 * - 封面点击下载(对照旧 downloadCover):hover 遮罩提示 → fetch → blob → a[download]
 * - 音质选择(沿用旧页 SONG_LEVEL_DATA 枚举)→ api.getMusicUrl 取直链
 *   → fetch 流式下载(对照旧 downloadFile:reader 循环读、Content-Length 可得时显示百分比,
 *     不可得显示已下载字节数)→ blob → a[download];跨域 fetch 被拦时回退 a[href] 直链并 toast 说明
 * - 歌词区块(对照旧 Download.vue fetchLyrics/downloadLyric):
 *   getSongLyric + getAMttmlLyric → tabs 预览 / 复制 / 下载
 * - filesDB 缓存管理简版:列出既有键 + 单项删除
 * - 旧页 Electron 专属能力(写本地目录、deleteFile IPC)省略
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download as DownloadIcon } from "lucide-react";
import { api } from "@met/core";
import { Button } from "@/components/ui/button";
import { Select, type SelectOption } from "@/components/ui/select";
import { copyText } from "@/lib/clipboard";
import { deleteFile, listFileKeys } from "@/lib/filesDB";
import { useMusicStore } from "@/stores/music";

/** 歌词 tab 项(对照旧 Download.vue fetchLyrics 的 lyrics 数组) */
interface LyricItem {
  label: string;
  content: string;
  type: string;
  ext: "qrc" | "lrc" | "ttml";
}

/** 音质枚举(与旧 Download.vue SONG_LEVEL_DATA 一致) */
const SONG_LEVEL_DATA: Record<string, { label: string; tip: string }> = {
  NAC: { label: "NAC 品质", tip: "最高76kbps 自研AICodec编码" },
  WEB: { label: "普通 WEB", tip: "在线流媒体音质" },
  HQ: { label: "极高 HQ", tip: "最高 320kbps" },
  SQ: { label: "无损 SQ", tip: "高保真无损音质" },
  RS: { label: "高分辨率音源 Hi-Res", tip: "高于 44.1kHz/16bit" },
  DTS: { label: "杜比 5.1 声道", tip: "环绕声体验" },
  Q360V1: { label: "臻品全景声 V1", tip: "独家自研空间音频" },
  Q360V2: { label: "臻品全景声 V2", tip: "多声道空间音频" },
  QAI: { label: "臻品母带", tip: "AI 还原极致细节" },
  DTSX: { label: "DTS:X", tip: "三维感音效" },
  RA360: { label: "360 Reality Audio", tip: "球形空间音频" },
  DA: { label: "杜比全景声 Dolby Atmos", tip: "自然真实的环绕音效" },
};

const QUALITY_OPTIONS: SelectOption[] = Object.entries(SONG_LEVEL_DATA).map(
  ([value, { label }]) => ({ value, label }),
);

/** 专辑 pmid → 封面地址(与旧页一致) */
const coverFromPmid = (pmid?: string): string | undefined =>
  pmid ? `/api/web/album/cover/highpic?pic=T002R800x800M000${pmid}.jpg` : undefined;

/** 初始音质:?music_quality= 参数(合法枚举内,忽略大小写)优先,否则 "SQ" */
const initialQuality = (musicQuality?: string): string => {
  const upper = typeof musicQuality === "string" ? musicQuality.toUpperCase() : "";
  return upper && upper in SONG_LEVEL_DATA ? upper : "SQ";
};

/** 保存 Blob 为本地文件(blob URL + a[download],与旧页一致) */
const saveBlob = (blob: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

/** 字节数可读化(Content-Length 不可得时展示已下载量) */
const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

/** 歌曲文件下载状态机:空闲 / 解析直链 / 流式下载中 / 完成 / 失败(可重试) */
type DownloadPhase = "idle" | "resolving" | "downloading" | "done" | "failed";

const Download = () => {
  const search = useSearch({ strict: false }) as {
    id?: number | string;
    music_quality?: string;
  };
  const navigate = useNavigate();
  const playSongData = useMusicStore((s) => s.playSongData);

  // 数据源:?id= 参数优先,否则当前播放歌曲
  const mid =
    search.id != null && search.id !== ""
      ? String(search.id)
      : playSongData?.id != null && playSongData.id !== ""
        ? String(playSongData.id)
        : "";

  const [quality, setQuality] = useState(() => initialQuality(search.music_quality));
  const [downloadPhase, setDownloadPhase] = useState<DownloadPhase>("idle");
  // 进度:Content-Length 可得时为 0-100 百分比,不可得为 null(此时仅展示已下载字节数)
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [loadedBytes, setLoadedBytes] = useState(0);
  const [coverDownloading, setCoverDownloading] = useState(false);

  // 歌曲信息(res[mid].track_info,与旧 Comments.vue 的消费方式一致)
  const infoQuery = useQuery({
    queryKey: ["download", "musicInfo", mid],
    queryFn: () => api.getMusicInfo(mid),
    enabled: !!mid,
  });
  // 接口原始数据无稳定 schema,集中豁免
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const track = (infoQuery.data as any)?.[mid]?.track_info;
  const trackName: string = track?.title || track?.name || "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const singers: { mid?: string; name?: string; title?: string }[] = Array.isArray(
    track?.singer,
  )
    ? track.singer
    : [];
  const cover = coverFromPmid(track?.album?.pmid);

  // 歌词数据(对照旧 fetchLyrics:两接口并行,单侧失败不拖垮另一侧)
  const lyricQuery = useQuery({
    queryKey: ["download", "lyrics", mid],
    enabled: !!mid,
    queryFn: async () => {
      const [lrcRes, ttmlRes] = await Promise.allSettled([
        api.getSongLyric(mid),
        api.getAMttmlLyric(mid),
      ]);
      return {
        lyric: lrcRes.status === "fulfilled" ? lrcRes.value : null,
        ttml: ttmlRes.status === "fulfilled" ? ttmlRes.value : null,
      };
    },
  });

  // 组装 tab 列表(字段与顺序对照旧页:qrc/qrctrans/qrcroma/lrc/lrctrans/ttml)
  const lyricList = useMemo<LyricItem[]>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = lyricQuery.data?.lyric as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ttml = lyricQuery.data?.ttml as any;
    const lyrics: LyricItem[] = [];
    if (res?.qrc) lyrics.push({ label: "QRC 歌词", content: res.qrc, type: "qrc", ext: "qrc" });
    if (res?.qrctrans)
      lyrics.push({ label: "QRC 翻译", content: res.qrctrans, type: "qrctrans", ext: "lrc" });
    if (res?.qrcroma)
      lyrics.push({ label: "QRC 音译", content: res.qrcroma, type: "roma", ext: "qrc" });
    if (res?.lrc) lyrics.push({ label: "LRC 歌词", content: res.lrc, type: "lrc", ext: "lrc" });
    if (res?.lrctrans)
      lyrics.push({ label: "LRC 翻译", content: res.lrctrans, type: "lrctrans", ext: "lrc" });
    if (ttml?.status === "success" && ttml.content)
      lyrics.push({ label: "TTML 歌词", content: ttml.content, type: "ttml", ext: "ttml" });
    return lyrics;
  }, [lyricQuery.data]);

  // 当前歌词 tab(默认第一个;列表变化后自动回退到第一个)
  const [lyricTab, setLyricTab] = useState<string | null>(null);
  const activeLyricType =
    lyricTab && lyricList.some((item) => item.type === lyricTab)
      ? lyricTab
      : (lyricList[0]?.type ?? null);
  const activeLyric = lyricList.find((item) => item.type === activeLyricType) ?? null;

  /** 歌词文件名主体(对照旧 downloadLyric:歌名 - 歌手1_歌手2) */
  const lyricBaseName = useMemo(() => {
    if (!trackName) return "lyric";
    const singerNames = singers
      .map((s) => s.name || s.title)
      .filter(Boolean)
      .join("_");
    return singerNames ? `${trackName} - ${singerNames}` : trackName;
  }, [trackName, singers]);

  /** 下载当前 tab 歌词(Blob + a[download],扩展名按 tab) */
  const handleDownloadLyric = (item: LyricItem) => {
    try {
      const blob = new Blob([item.content], { type: "text/plain;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${lyricBaseName}.${item.ext}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(`${item.label} 下载成功`);
    } catch (error) {
      console.error("歌词下载失败：", error);
      toast.error("下载失败");
    }
  };

  /** 封面文件名(对照旧 coverFilename:歌名 - 歌手1_歌手2.jpg) */
  const coverFilename = useMemo(() => {
    if (!trackName) return "cover.jpg";
    const singerNames = singers
      .map((s) => s.name || s.title)
      .filter(Boolean)
      .join("_");
    return singerNames ? `${trackName} - ${singerNames}.jpg` : `${trackName}.jpg`;
  }, [trackName, singers]);

  /** 点击封面下载(对照旧 downloadCover:fetch → blob → a[download]) */
  const handleDownloadCover = async () => {
    if (!cover || coverDownloading) return;
    setCoverDownloading(true);
    try {
      const response = await fetch(cover);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      saveBlob(await response.blob(), coverFilename);
      toast.success("封面保存成功");
    } catch (error) {
      console.error("封面下载失败：", error);
      toast.error("封面保存失败");
    } finally {
      setCoverDownloading(false);
    }
  };

  // filesDB 缓存键列表
  const [cacheKeys, setCacheKeys] = useState<string[]>([]);
  const refreshCacheKeys = useCallback(async () => {
    try {
      const keys = await listFileKeys();
      setCacheKeys(keys.map((key) => String(key)));
    } catch (error) {
      console.error("读取缓存列表失败：", error);
    }
  }, []);
  useEffect(() => {
    refreshCacheKeys();
  }, [refreshCacheKeys]);

  /** 获取直链 → fetch 流式下载(对照旧 downloadFile);跨域被拦时回退 a[href] 直链 */
  const handleDownload = async () => {
    if (!mid || downloadPhase === "resolving" || downloadPhase === "downloading") return;
    setDownloadPhase("resolving");
    setProgressPercent(null);
    setLoadedBytes(0);

    // 第一步:解析直链与文件名(保留现有文件名逻辑)
    let url = "";
    let filename = "";
    try {
      const res = await api.getMusicUrl(mid, quality);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (res as any)?.data ?? res;
      const trackInfo = data?.[0]?.track_info;
      const fileUrl: string | undefined = trackInfo?.file_url;
      if (!fileUrl) {
        toast.warning("该音质暂无可下载链接,请尝试其他音质");
        setDownloadPhase("idle");
        return;
      }
      url = fileUrl.replace(/^http:/, "https:");
      const extension = new URL(url).pathname.split(".").pop()?.toLowerCase() || "mp3";
      const singerNames = Array.isArray(trackInfo?.singer)
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          trackInfo.singer.map((s: any) => s?.name).filter(Boolean).join("_")
        : "";
      filename = `${trackInfo?.name || trackName || mid}${
        singerNames ? ` - ${singerNames}` : ""
      }.${extension}`;
    } catch (error) {
      console.error("获取下载链接失败：", error);
      toast.error("获取下载链接失败,请重试");
      setDownloadPhase("failed");
      return;
    }

    // 第二步:流式下载(reader 循环读,Content-Length 可得时按百分比,否则按字节数)
    try {
      setDownloadPhase("downloading");
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error("ReadableStream unavailable");
      const total = Number.parseInt(response.headers.get("content-length") ?? "", 10);
      const reader = response.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        setLoadedBytes(loaded);
        if (Number.isFinite(total) && total > 0) {
          setProgressPercent(Math.min(100, Math.round((loaded * 100) / total)));
        }
      }
      saveBlob(new Blob(chunks), filename);
      setDownloadPhase("done");
      toast.success(`歌曲文件 ${filename} 下载成功`);
    } catch (error) {
      // 跨域直链常被 CORS 拦截:回退现有 a[href] 直链方式,交给浏览器下载
      console.error("歌曲流式下载失败,尝试直链回退：", error);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setDownloadPhase("idle");
        toast.info("直链跨域受限,已改用浏览器直接下载(无进度显示)");
      } catch (fallbackError) {
        console.error("直链回退下载失败：", fallbackError);
        setDownloadPhase("failed");
        toast.error("下载失败,请点击按钮重试");
      }
    }
  };

  /** 删除单条缓存 */
  const handleDeleteCache = async (key: string) => {
    try {
      await deleteFile(key);
      toast.success("已删除该缓存");
      await refreshCacheKeys();
    } catch (error) {
      console.error("删除缓存失败：", error);
      toast.error("删除缓存失败");
    }
  };

  if (!mid) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2">
        <p className="text-lg font-medium text-[var(--met-fg)]">暂无可下载的歌曲</p>
        <p className="text-sm text-[var(--met-fg-dim)]">
          请先播放一首歌曲,或从歌曲详情进入下载页
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <h1 className="text-xl font-semibold text-[var(--met-fg)]">歌曲下载</h1>

      {/* 歌曲卡 */}
      <section className="rounded-2xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] p-5">
        {infoQuery.isLoading ? (
          <div className="flex animate-pulse items-center gap-4">
            <div className="h-16 w-16 shrink-0 rounded-lg bg-[var(--met-border)]" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-1/3 rounded bg-[var(--met-border)]" />
              <div className="h-3 w-1/4 rounded bg-[var(--met-border)]" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            {cover ? (
              <button
                type="button"
                title="点击下载封面"
                onClick={handleDownloadCover}
                className="group relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-[var(--met-border)]"
              >
                <img src={cover} alt="" className="h-full w-full object-cover" />
                {/* hover 遮罩 + 下载图标(下载中常显) */}
                <span
                  className={`absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity ${
                    coverDownloading
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 coarse:opacity-100"
                  }`}
                >
                  <DownloadIcon className="h-5 w-5 text-white" />
                </span>
              </button>
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-[var(--met-border)] bg-[var(--met-bg)] text-xs text-[var(--met-fg-dim)]">
                无封面
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-medium text-[var(--met-fg)]">
                {trackName || (infoQuery.isError ? "歌曲信息获取失败" : "正在解析…")}
              </div>
              {singers.length > 0 ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-[var(--met-fg-dim)]">
                  {singers.map((singer, index) => (
                    <span key={singer.mid ?? index} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          singer.mid &&
                          navigate({ to: "/artist", search: { id: singer.mid } })
                        }
                        className="cursor-pointer transition-opacity hover:opacity-60"
                      >
                        {singer.name || singer.title}
                      </button>
                      {index < singers.length - 1 ? <span>/</span> : null}
                    </span>
                  ))}
                </div>
              ) : null}
              {track?.album?.title || track?.album?.name ? (
                <button
                  type="button"
                  onClick={() =>
                    track?.album?.mid &&
                    navigate({ to: "/album", search: { id: String(track.album.mid) } })
                  }
                  className="mt-0.5 block max-w-full cursor-pointer truncate text-xs text-[var(--met-fg-dim)] transition-opacity hover:opacity-60"
                >
                  {track.album.title || track.album.name}
                </button>
              ) : null}
            </div>
          </div>
        )}

        {/* 音质选择 + 下载 */}
        <div className="mt-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-[var(--met-fg-dim)]">解析音质</span>
            <Select value={quality} options={QUALITY_OPTIONS} onValueChange={setQuality} />
          </div>
          <p className="text-xs text-[var(--met-fg-dim)]">
            {SONG_LEVEL_DATA[quality]?.tip || "暂无说明"}
          </p>
          <Button
            variant="primary"
            disabled={
              downloadPhase === "resolving" ||
              downloadPhase === "downloading" ||
              infoQuery.isLoading
            }
            onClick={handleDownload}
            className="w-full"
          >
            {downloadPhase === "resolving"
              ? "正在解析下载链接…"
              : downloadPhase === "downloading"
                ? progressPercent != null
                  ? `正在下载 ${progressPercent}%`
                  : `正在下载 ${formatBytes(loadedBytes)}`
                : downloadPhase === "done"
                  ? "下载完成,再次下载"
                  : downloadPhase === "failed"
                    ? "下载失败,点击重试"
                    : "立即下载歌曲文件"}
          </Button>
          {downloadPhase === "downloading" ? (
            <div className="flex flex-col gap-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--met-border)]">
                <div
                  className={`h-full rounded-full bg-[var(--met-primary)] transition-[width] duration-200 ${
                    progressPercent == null ? "w-1/3 animate-pulse" : ""
                  }`}
                  style={progressPercent != null ? { width: `${progressPercent}%` } : undefined}
                />
              </div>
              <span className="text-right text-xs text-[var(--met-fg-dim)]">
                {progressPercent != null
                  ? `${progressPercent}%（${formatBytes(loadedBytes)}）`
                  : `已下载 ${formatBytes(loadedBytes)}（总大小未知）`}
              </span>
            </div>
          ) : null}
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/song", search: { id: mid } })}
            className="w-full"
          >
            查看单曲信息
          </Button>
        </div>
      </section>

      {/* 歌词(对照旧 Download.vue 歌词 tabs 区块) */}
      <section className="rounded-2xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] p-5">
        <h2 className="text-base font-medium text-[var(--met-fg)]">歌词</h2>
        {lyricQuery.isLoading ? (
          <div className="mt-4 flex animate-pulse flex-col gap-2">
            <div className="h-4 w-1/2 rounded bg-[var(--met-border)]" />
            <div className="h-4 w-2/3 rounded bg-[var(--met-border)]" />
            <div className="h-4 w-1/3 rounded bg-[var(--met-border)]" />
          </div>
        ) : lyricList.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--met-fg-dim)]">暂无歌词</p>
        ) : (
          <>
            {/* tab 组(仅有内容的 tab 显示) */}
            <div className="mt-3 flex flex-wrap gap-2">
              {lyricList.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setLyricTab(item.type)}
                  className={`cursor-pointer rounded-full px-3 py-1 text-xs transition-colors ${
                    item.type === activeLyricType
                      ? "bg-[var(--met-primary)] text-[var(--met-primary-fg)]"
                      : "bg-[var(--met-bg)] text-[var(--met-fg-dim)] hover:bg-[var(--met-bg-hover)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {activeLyric ? (
              <>
                {/* 当前 tab 内容预览 */}
                <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-[var(--met-border)] bg-[var(--met-bg)] p-3">
                  <pre className="m-0 whitespace-pre-wrap break-all font-mono text-[13px] leading-relaxed text-[var(--met-fg-dim)]">
                    {activeLyric.content}
                  </pre>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyText(activeLyric.content, "歌词复制成功")}
                  >
                    复制内容
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleDownloadLyric(activeLyric)}
                  >
                    下载 .{activeLyric.ext}
                  </Button>
                </div>
              </>
            ) : null}
          </>
        )}
      </section>

      {/* 缓存管理(filesDB 简版) */}
      <section className="rounded-2xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-[var(--met-fg)]">
            本地缓存
            <span className="ml-2 text-xs font-normal text-[var(--met-fg-dim)]">
              共 {cacheKeys.length} 项
            </span>
          </h2>
          <Button size="sm" variant="ghost" onClick={() => refreshCacheKeys()}>
            刷新
          </Button>
        </div>
        {cacheKeys.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--met-fg-dim)]">暂无缓存文件</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-[var(--met-border)]">
            {cacheKeys.map((key) => (
              <li key={key} className="flex items-center gap-3 py-2">
                <span
                  className="min-w-0 flex-1 truncate text-sm text-[var(--met-fg)]"
                  title={key}
                >
                  {key}
                </span>
                <Button size="sm" variant="danger" onClick={() => handleDeleteCache(key)}>
                  删除
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default Download;
