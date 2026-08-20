import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { api } from "@met/core";
import CommentList, { type CommentItem } from "@/components/list/CommentList";

const PAGE_SIZE = 25;

/** 歌曲评论页(对照旧 views/Comments.vue:歌曲信息卡 + 游标分页评论) */
export default function Comments() {
  const search = useSearch({ strict: false }) as { id?: number | string };
  const id = search.id;

  // 游标栈:第 page 页的起始游标为 cursorStack[page-1](第一页为空串)
  const [page, setPage] = useState(1);
  const [cursorStack, setCursorStack] = useState<string[]>([""]);
  const cursor = cursorStack[page - 1] ?? "";

  // 歌曲信息(取标题/歌手/专辑与评论所需的数字 songID)
  const infoQuery = useQuery({
    queryKey: ["song", "info", id],
    queryFn: () => api.getMusicInfo(id as number | string),
    enabled: id != null && id !== "",
  });

  // 原始接口字段访问豁免点(响应形如 { [mid]: { track_info } })
  const infoRaw = infoQuery.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const track = infoRaw?.[String(id)]?.track_info ?? null;
  const songId: number | undefined = track?.id;
  const singers: string = Array.isArray(track?.singer)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      track.singer.map((s: any) => s.name || s.title).filter(Boolean).join(" / ")
    : "未知歌手";

  // 评论列表(游标分页)
  const commentsQuery = useQuery({
    queryKey: ["song", "comments", songId, page, cursor],
    queryFn: () => api.getComments(songId as number, page, PAGE_SIZE, cursor || undefined),
    enabled: songId != null,
    placeholderData: keepPreviousData,
  });

  // 原始接口字段访问豁免点
  const commentsRaw = commentsQuery.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const rawComments: any[] = // eslint-disable-line @typescript-eslint/no-explicit-any
    commentsRaw?.code === 0 ? (commentsRaw.req?.data?.CommentList?.Comments ?? []) : [];

  const comments = useMemo<CommentItem[]>(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rawComments.map((c: any, index: number) => ({
        id: c.SeqNo ?? index,
        avatar: c.Avatar || undefined,
        nick: c.Nick || "未知用户",
        content: c.Content || "",
        time: c.PubTime ? Number(c.PubTime) * 1000 : undefined,
        likedCount: c.PraiseNum ?? 0,
        location: c.Location || undefined,
        replies: Array.isArray(c.SubComments)
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            c.SubComments.map((sub: any) => ({
              nick: sub.Nick || "未知用户",
              content: sub.Content || "",
            }))
          : undefined,
      })),
    [rawComments],
  );

  const loading = infoQuery.isLoading || commentsQuery.isLoading;

  const handleNextPage = (): void => {
    const lastSeqNo = rawComments[rawComments.length - 1]?.SeqNo;
    if (lastSeqNo == null) return;
    setCursorStack((stack) => {
      const next = stack.slice(0, page);
      next.push(String(lastSeqNo));
      return next;
    });
    setPage((p) => p + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePrevPage = (): void => {
    if (page <= 1) return;
    setPage((p) => p - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  if (infoQuery.isError) {
    return (
      <div className="py-24 text-center text-sm text-[var(--met-fg-dim)]">
        歌曲信息加载失败,请稍后重试
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6">
      {/* 歌曲信息卡 */}
      {infoQuery.isLoading ? (
        <div className="animate-pulse rounded-xl bg-[var(--met-bg-elevated)] p-5">
          <div className="mb-3 h-5 w-1/3 rounded bg-[var(--met-border)]" />
          <div className="mb-2 h-3 w-1/4 rounded bg-[var(--met-border)]" />
          <div className="h-3 w-1/5 rounded bg-[var(--met-border)]" />
        </div>
      ) : track ? (
        <div className="rounded-xl bg-[var(--met-bg-elevated)] p-5">
          <h1 className="text-xl font-semibold text-[var(--met-fg)]">
            {track.title || track.name || "未知标题"}
          </h1>
          <p className="mt-2 text-sm text-[var(--met-fg-dim)]">歌手: {singers}</p>
          <p className="mt-1 text-sm text-[var(--met-fg-dim)]">
            专辑: {track.album?.title || track.album?.name || "未知专辑"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-[var(--met-bg-elevated)] p-5 text-sm text-[var(--met-fg-dim)]">
          未找到歌曲信息
        </div>
      )}

      {/* 评论列表 */}
      <h2 className="mt-6 mb-3 text-base font-semibold text-[var(--met-fg)]">
        歌曲评论(第 {page} 页)
      </h2>
      {commentsQuery.isError ? (
        <div className="py-16 text-center text-sm text-[var(--met-fg-dim)]">
          评论加载失败,请稍后重试
        </div>
      ) : (
        <CommentList comments={comments} loading={loading} />
      )}

      {/* 简版分页 */}
      <div className="flex items-center justify-center gap-3 py-8">
        <button
          type="button"
          disabled={page <= 1 || commentsQuery.isFetching}
          onClick={handlePrevPage}
          className="rounded-full border border-[var(--met-border)] px-4 py-1.5 text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          上一页
        </button>
        <span className="min-w-16 text-center text-xs text-[var(--met-fg-dim)]">第 {page} 页</span>
        <button
          type="button"
          disabled={rawComments.length < PAGE_SIZE || commentsQuery.isFetching}
          onClick={handleNextPage}
          className="rounded-full border border-[var(--met-border)] px-4 py-1.5 text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
