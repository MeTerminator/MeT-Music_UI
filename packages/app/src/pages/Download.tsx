/**
 * 歌曲下载页(对照旧 src/views/Download.vue,web 能力内实现):
 * - 数据源:?id= 参数优先,否则取当前播放歌曲;api.getMusicInfo 展示歌曲卡
 * - 音质选择(沿用旧页 SONG_LEVEL_DATA 枚举)→ api.getMusicUrl 取直链 → <a download> 触发浏览器下载
 * - filesDB 缓存管理简版:列出既有键 + 单项删除
 * - 旧页 Electron 专属能力(写本地目录、deleteFile IPC)与歌词下载区块省略
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "@met/core";
import { Button } from "@/components/ui/button";
import { Select, type SelectOption } from "@/components/ui/select";
import { deleteFile, listFileKeys } from "@/lib/filesDB";
import { useMusicStore } from "@/stores/music";

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

const Download = () => {
  const search = useSearch({ strict: false }) as { id?: number | string };
  const navigate = useNavigate();
  const playSongData = useMusicStore((s) => s.playSongData);

  // 数据源:?id= 参数优先,否则当前播放歌曲
  const mid =
    search.id != null && search.id !== ""
      ? String(search.id)
      : playSongData?.id != null && playSongData.id !== ""
        ? String(playSongData.id)
        : "";

  const [quality, setQuality] = useState("SQ");
  const [downloading, setDownloading] = useState(false);

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

  /** 获取直链并触发浏览器下载 */
  const handleDownload = async () => {
    if (!mid || downloading) return;
    setDownloading(true);
    try {
      const res = await api.getMusicUrl(mid, quality);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (res as any)?.data ?? res;
      const trackInfo = data?.[0]?.track_info;
      const fileUrl: string | undefined = trackInfo?.file_url;
      if (!fileUrl) {
        toast.warning("该音质暂无可下载链接,请尝试其他音质");
        return;
      }
      const url = fileUrl.replace(/^http:/, "https:");
      const extension = new URL(url).pathname.split(".").pop()?.toLowerCase() || "mp3";
      const singerNames = Array.isArray(trackInfo?.singer)
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          trackInfo.singer.map((s: any) => s?.name).filter(Boolean).join("_")
        : "";
      const filename = `${trackInfo?.name || trackName || mid}${
        singerNames ? ` - ${singerNames}` : ""
      }.${extension}`;
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("已开始下载");
    } catch (error) {
      console.error("获取下载链接失败：", error);
      toast.error("获取下载链接失败,请稍后重试");
    } finally {
      setDownloading(false);
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
              <img
                src={cover}
                alt=""
                className="h-16 w-16 shrink-0 rounded-lg border border-[var(--met-border)] object-cover"
              />
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
            disabled={downloading || infoQuery.isLoading}
            onClick={handleDownload}
            className="w-full"
          >
            {downloading ? "正在解析下载链接…" : "立即下载歌曲文件"}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/song", search: { id: mid } })}
            className="w-full"
          >
            查看单曲信息
          </Button>
        </div>
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
