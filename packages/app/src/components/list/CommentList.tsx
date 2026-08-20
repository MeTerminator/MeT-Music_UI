import { formatNumber, getCommentTime } from "@met/core";

/** 规范化后的评论项(由页面从原始接口数据映射) */
export interface CommentItem {
  /** 唯一标识(SeqNo / commentId) */
  id: string | number;
  /** 头像地址 */
  avatar?: string;
  /** 昵称 */
  nick: string;
  /** 评论内容 */
  content: string;
  /** 发布时间(毫秒时间戳) */
  time?: number;
  /** 点赞数 */
  likedCount?: number;
  /** IP / 地理位置 */
  location?: string;
  /** 子回复 */
  replies?: { nick: string; content: string }[];
}

interface CommentListProps {
  comments: CommentItem[];
  loading?: boolean;
  /** 加载占位数量 */
  loadingNum?: number;
}

/** 可复用评论列表(对照旧 components/List/CommentList.vue,精简为展示型组件) */
export default function CommentList({
  comments,
  loading = false,
  loadingNum = 8,
}: CommentListProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: loadingNum }, (_, i) => (
          <div
            key={i}
            className="flex animate-pulse gap-3 rounded-xl bg-[var(--met-bg-elevated)] p-4"
          >
            <div className="h-11 w-11 shrink-0 rounded-full bg-[var(--met-border)]" />
            <div className="flex-1">
              <div className="mb-2 h-3 w-1/5 rounded bg-[var(--met-border)]" />
              <div className="mb-1.5 h-3 w-4/5 rounded bg-[var(--met-border)]" />
              <div className="h-3 w-2/5 rounded bg-[var(--met-border)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!comments.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--met-fg-dim)]">
        <span className="text-sm">暂无评论</span>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {comments.map((comment) => (
        <li key={comment.id} className="flex gap-3 rounded-xl bg-[var(--met-bg-elevated)] p-4">
          {/* 头像 */}
          {comment.avatar ? (
            <img
              src={comment.avatar}
              alt=""
              loading="lazy"
              className="h-11 w-11 shrink-0 rounded-full bg-[var(--met-border)] object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--met-border)] text-sm text-[var(--met-fg-dim)]">
              {comment.nick?.slice(0, 1) || "?"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {/* 昵称 */}
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-[var(--met-fg)]">
                {comment.nick || "未知用户"}
              </span>
              {comment.location ? (
                <span className="shrink-0 text-xs text-[var(--met-fg-dim)]">
                  {comment.location}
                </span>
              ) : null}
            </div>
            {/* 内容 */}
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--met-fg)]">
              {comment.content}
            </p>
            {/* 子回复 */}
            {comment.replies?.length ? (
              <div className="mt-2 rounded-lg border border-[var(--met-border)] px-3 py-2">
                {comment.replies.map((reply, i) => (
                  <p key={i} className="py-0.5 text-xs text-[var(--met-fg-dim)]">
                    <span className="font-medium text-[var(--met-fg)]">@{reply.nick}:</span>{" "}
                    {reply.content}
                  </p>
                ))}
              </div>
            ) : null}
            {/* 时间 / 点赞 */}
            <div className="mt-2 flex items-center justify-between text-xs text-[var(--met-fg-dim)]">
              <span>{comment.time ? getCommentTime(comment.time) : ""}</span>
              <span className="flex items-center gap-1">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                  <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
                </svg>
                {formatNumber(comment.likedCount ?? 0)}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
