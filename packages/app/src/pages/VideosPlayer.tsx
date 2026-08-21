import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { Music } from "lucide-react";
// plyr 的类型声明(export=)与其 ESM 产物(type: module + export default)冲突,
// 默认导入的类型需豁免;类型侧改用其 UMD 全局命名空间(export as namespace Plyr)。
// @ts-expect-error -- plyr d.ts 在 bundler 解析下无 default 导出
import PlyrDefault from "plyr";
import "plyr/dist/plyr.css";
import { api, fadePlayOrPause, formatNumber } from "@met/core";
import { useStatusStore } from "@/stores/status";

/** plyr 构造器(运行时 default 导出即类本体) */
const PlyrCtor = PlyrDefault as new (
  target: HTMLElement | string,
  options?: Plyr.Options,
) => Plyr;

/** MV 详情(mv/detail 返回 data 字段;仅声明本页用到的字段) */
interface VideoDetail {
  id?: number | string;
  name?: string;
  cover?: string;
  playCount?: number;
  commentCount?: number;
  publishTime?: string;
  desc?: string;
  brs?: { br: number; size?: number; point?: number }[];
  artists?: { id?: number | string; name?: string; img1v1Url?: string }[];
  videoGroup?: { id?: number | string; name?: string }[];
}

/** 播放器配置(对照旧 Player.vue playerOptions) */
const playerOptions: Plyr.Options = {
  controls: [
    "play-large",
    "play",
    "progress",
    "current-time",
    "mute",
    "volume",
    "captions",
    "settings",
    "airplay",
    "fullscreen",
  ],
  settings: ["captions", "quality", "speed"],
  ratio: "16:9",
  invertTime: false,
  autoplay: false,
  quality: {
    default: 1080,
    options: [1080, 720, 480, 240],
  },
  i18n: {
    play: "播放",
    pause: "暂停",
    speed: "速度",
    settings: "设置",
    normal: "正常",
    quality: "画质",
    pip: "画中画",
    enterFullscreen: "开启全屏",
    exitFullscreen: "退出全屏",
    mute: "音量",
    unmute: "静音",
  },
  tooltips: {
    controls: true,
  },
};

/** 头部信息骨架 */
const DetailSkeleton = () => (
  <div className="mb-5 flex animate-pulse flex-col gap-3">
    <div className="h-6 w-2/3 rounded bg-[var(--met-bg-elevated)]" />
    <div className="h-3 w-1/3 rounded bg-[var(--met-bg-elevated)]" />
  </div>
);

/** 视频播放页(对照旧 src/views/Player.vue;plyr 播放器) */
export default function VideosPlayer() {
  const search = useSearch({ strict: false }) as { id?: string };
  const id = search.id;

  const [descExpanded, setDescExpanded] = useState(false);
  const [urlError, setUrlError] = useState(false);

  // MV 详情
  const detailQuery = useQuery({
    queryKey: ["video", "detail", id],
    queryFn: () => api.getVideoDetail(id as string),
    enabled: id != null && id !== "",
  });

  // 原始接口字段访问豁免点
  const raw = detailQuery.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const videoData: VideoDetail | null = raw?.data ?? null;
  const brs = videoData?.brs;

  // 各分辨率播放地址(对照旧页:按 brs 枚举逐个请求 mv/url)
  // queryKey 带上 brs 集合,详情返回的分辨率列表变化时重新拉取
  const urlsQuery = useQuery({
    queryKey: ["video", "urls", id, (brs ?? []).map((v) => v.br).join(",")],
    queryFn: async (): Promise<Plyr.Source[]> => {
      const results = await Promise.all(
        (brs ?? []).map((v) => api.getVideoUrl(id as string, v.br)),
      );
      return results
        // 原始接口字段访问豁免点
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any): Plyr.Source => ({
          src: String(r?.data?.url ?? "").replace(/^http:/, "https:"),
          type: "video/mp4",
          size: r?.data?.r as number | undefined,
        }))
        .filter((s) => !!s.src);
    },
    enabled: id != null && id !== "" && !!brs?.length,
  });
  const sources = urlsQuery.data;

  // 地址加载失败提示(旧页 $message.error)
  useEffect(() => {
    setUrlError(urlsQuery.isError || (urlsQuery.isSuccess && !urlsQuery.data?.length));
  }, [urlsQuery.isError, urlsQuery.isSuccess, urlsQuery.data]);

  // plyr 实例。video 元素由本 effect 手动创建:plyr 的 destroy 会用缓存克隆
  // 替换原元素,若让 React 渲染 video,严格模式双挂载后 ref 将指向已脱离
  // 文档的节点;容器归 React,内部节点归 plyr,cleanup 中 destroy 并清空容器。
  const plyrContainerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<Plyr | null>(null);

  useEffect(() => {
    const container = plyrContainerRef.current;
    if (!container) return;
    const video = document.createElement("video");
    video.className = "w-full";
    video.playsInline = true;
    container.appendChild(video);
    const player = new PlyrCtor(video, playerOptions);
    playerRef.current = player;
    // 视频播放时暂停音乐并隐藏底栏(对照旧页 playing/pause 事件)
    player.on("playing", () => {
      useStatusStore.setState({ showPlayBar: false });
      fadePlayOrPause("pause");
    });
    player.on("pause", () => {
      useStatusStore.setState({ showPlayBar: true });
    });
    return () => {
      playerRef.current = null;
      try {
        player.destroy();
      } catch {
        // 元素可能已被移除,忽略销毁异常
      }
      // 清掉 destroy 还原出的克隆节点
      container.replaceChildren();
      // 离开页面恢复底栏(旧页 onBeforeUnmount)
      useStatusStore.setState({ showPlayBar: true });
    };
    // id 变化或从错误态恢复时重建播放器
  }, [id, detailQuery.isError]);

  // 数据就绪后写入播放源
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !videoData || !sources?.length) return;
    player.source = {
      type: "video",
      title: videoData.name,
      sources,
      poster: videoData.cover?.replace(/^http:/, "https:"),
    };
  }, [videoData, sources]);

  // 无 id(旧页 isHasVideoId:参数不完整则返回)
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

  // 详情加载失败(旧页 $message.error("视频详情加载失败"))
  if (detailQuery.isError) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2">
        <p className="text-lg font-semibold text-[var(--met-fg)]">视频详情加载失败</p>
        <p className="text-sm text-[var(--met-fg-dim)]">该视频可能已下架或链接失效</p>
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
    <div
      className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 lg:flex-row"
      style={
        {
          "--plyr-color-main": "var(--met-primary)",
          "--plyr-control-radius": "8px",
        } as React.CSSProperties
      }
    >
      {/* 左侧:播放器主体 */}
      <div className="min-w-0 flex-1">
        {/* 返回 */}
        <button
          type="button"
          onClick={() => history.back()}
          className="mb-4 flex items-center gap-1 rounded-full border border-[var(--met-border)] px-3 py-1 text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          返回
        </button>

        {/* 视频信息 */}
        {videoData ? (
          <div className="mb-5 flex flex-col gap-2">
            <h1 className="line-clamp-2 text-xl font-bold text-[var(--met-fg)] sm:text-2xl">
              {videoData.name || "未知视频"}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--met-fg-dim)]">
              {/* 播放量 */}
              {videoData.playCount ? (
                <span className="flex items-center gap-1">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
                  </svg>
                  {formatNumber(videoData.playCount)}
                </span>
              ) : null}
              {/* 评论量 */}
              {videoData.commentCount ? (
                <span className="flex items-center gap-1">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
                  </svg>
                  {formatNumber(videoData.commentCount)}
                </span>
              ) : null}
              {/* 发布时间 */}
              {videoData.publishTime ? (
                <span className="flex items-center gap-1">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z" />
                  </svg>
                  {videoData.publishTime}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <DetailSkeleton />
        )}

        {/* 视频地址加载失败提示 */}
        {urlError ? (
          <div className="mb-3 rounded-lg border border-[var(--met-border)] bg-[var(--met-bg-elevated)] px-4 py-2 text-sm text-[var(--met-fg-dim)]">
            视频地址加载失败,请稍后重试
          </div>
        ) : null}

        {/* plyr 播放器(video 元素由 effect 动态创建) */}
        <div ref={plyrContainerRef} className="overflow-hidden rounded-lg bg-black" />

        {/* 更多操作(旧页 dropdown:打开源页面链接) */}
        <div className="mt-4 flex items-center">
          <button
            type="button"
            onClick={() => window.open(`https://y.qq.com/n/ryqq/mv/${id}`)}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-[var(--met-fg-dim)] transition-colors hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-fg)]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M3.9 12a5 5 0 0 1 5-5h4v2h-4a3 3 0 0 0 0 6h4v2h-4a5 5 0 0 1-5-5zm7.1 1h2v-2h-2v2zm4.1-6h4a5 5 0 0 1 0 10h-4v-2h4a3 3 0 0 0 0-6h-4V7z" />
            </svg>
            打开源页面链接
          </button>
        </div>

        {/* 简介及标签 */}
        {videoData ? (
          <div className="mt-3 px-1">
            <div className="my-3 h-px bg-[var(--met-border)]" />
            {videoData.desc ? (
              <p
                onClick={() => setDescExpanded((v) => !v)}
                className={`cursor-pointer text-sm leading-relaxed text-[var(--met-fg)] ${
                  descExpanded ? "" : "line-clamp-3"
                }`}
              >
                {videoData.desc}
              </p>
            ) : (
              <p className="text-sm text-[var(--met-fg)]">该视频暂无简介</p>
            )}
            {videoData.videoGroup?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {videoData.videoGroup.map((item, index) => (
                  <span
                    key={`${item.id}-${index}`}
                    className="rounded-full bg-[var(--met-bg-elevated)] px-4 py-1 text-xs text-[var(--met-fg-dim)]"
                  >
                    {item.name}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="my-3 h-px bg-[var(--met-border)]" />
          </div>
        ) : (
          <div className="mt-3 flex animate-pulse flex-col gap-2 px-1">
            <div className="h-3 w-full rounded bg-[var(--met-bg-elevated)]" />
            <div className="h-3 w-5/6 rounded bg-[var(--met-bg-elevated)]" />
            <div className="h-3 w-2/3 rounded bg-[var(--met-bg-elevated)]" />
          </div>
        )}
      </div>

      {/* 右侧:歌手信息 */}
      <div className="w-full shrink-0 lg:mt-14 lg:w-[280px]">
        <h2 className="mb-3 border-l-4 border-[var(--met-primary)] pl-2 text-sm font-semibold text-[var(--met-fg)]">
          歌手信息
        </h2>
        {videoData?.artists ? (
          videoData.artists.map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              className="mb-4 flex items-center rounded-lg bg-[var(--met-bg-elevated)] p-4"
            >
              {item.img1v1Url ? (
                <img
                  src={item.img1v1Url.replace(/^http:/, "https:").replace("500x500", "300x300")}
                  alt=""
                  loading="lazy"
                  className="mr-4 h-[60px] w-[60px] rounded-full bg-[var(--met-bg)] object-cover shadow"
                />
              ) : (
                <div className="mr-4 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[var(--met-bg)] text-xl text-[var(--met-fg-dim)]">
                  <Music size={20} aria-hidden="true" />
                </div>
              )}
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="truncate text-base font-bold text-[var(--met-fg)]">
                  {item.name || "未知歌手"}
                </span>
                <Link
                  to="/artist"
                  search={{ id: item.id != null ? String(item.id) : undefined }}
                  className="w-fit rounded-full border border-[var(--met-border)] px-3 py-1 text-xs text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)]"
                >
                  歌手详情
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="h-[94px] animate-pulse rounded-lg bg-[var(--met-bg-elevated)]" />
        )}
      </div>
    </div>
  );
}
