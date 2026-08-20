import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { formatNumber, getCommentTime } from "@met/core";
import { useSiteDataStore } from "@/stores/siteData";

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
  /** 当前用户是否已点赞(接口未提供时视为未点赞) */
  liked?: boolean;
  /** IP / 地理位置 */
  location?: string;
  /** 子回复 */
  replies?: { nick: string; content: string }[];
}

/** 点赞本地覆盖(乐观切换后的 liked / 计数) */
interface LikeOverride {
  liked: boolean;
  likedCount: number;
}

interface CommentListProps {
  comments: CommentItem[];
  loading?: boolean;
  /** 加载占位数量 */
  loadingNum?: number;
}

/** 可复用评论列表(对照旧 components/List/CommentList.vue) */
export default function CommentList({
  comments,
  loading = false,
  loadingNum = 8,
}: CommentListProps) {
  const userLoginStatus = useSiteDataStore((s) => s.userLoginStatus);
  // 点赞乐观覆盖(key: comment.id);列表数据变化(翻页/换歌)时清空
  const [likeOverrides, setLikeOverrides] = useState<Record<string, LikeOverride>>({});
  const lastLikeAtRef = useRef(0);

  useEffect(() => {
    setLikeOverrides({});
  }, [comments]);

  /**
   * 点赞/取消点赞(对照旧 CommentList.vue toLikeComment:登录门槛 + 3s 节流 +
   * 乐观计数增减与实心/空心切换)。
   * 注:旧代码 import 的 @/api/comment(likeComment)在旧仓库中并不存在(死引用,
   * 后端也无对应端点),故此处为纯前端本地切换,无请求、无需失败回滚;
   * 若未来补齐端点,在此处发请求并在失败时用 setLikeOverrides 回滚即可。
   */
  const toLikeComment = (comment: CommentItem): void => {
    if (!userLoginStatus) {
      toast.warning("请登录后使用");
      return;
    }
    const now = Date.now();
    if (now - lastLikeAtRef.current < 3000) {
      toast.warning("请稍后再操作");
      return;
    }
    lastLikeAtRef.current = now;

    const key = String(comment.id);
    setLikeOverrides((prev) => {
      const current = prev[key] ?? {
        liked: comment.liked ?? false,
        likedCount: comment.likedCount ?? 0,
      };
      return {
        ...prev,
        [key]: {
          liked: !current.liked,
          likedCount: Math.max(0, current.likedCount + (current.liked ? -1 : 1)),
        },
      };
    });
  };

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
      {comments.map((comment) => {
        const override = likeOverrides[String(comment.id)];
        const liked = override?.liked ?? comment.liked ?? false;
        const likedCount = override?.likedCount ?? comment.likedCount ?? 0;
        return (
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
              <button
                type="button"
                onClick={() => toLikeComment(comment)}
                aria-label={liked ? "取消点赞" : "点赞"}
                aria-pressed={liked}
                title={liked ? "取消点赞" : "点赞"}
                className={`flex cursor-pointer items-center gap-1 transition-colors ${
                  liked
                    ? "text-[var(--met-primary)]"
                    : "text-[var(--met-fg-dim)] hover:text-[var(--met-primary)]"
                }`}
              >
                <Heart
                  size={14}
                  aria-hidden="true"
                  fill={liked ? "currentColor" : "none"}
                />
                {liked ? likedCount : formatNumber(likedCount)}
              </button>
            </div>
          </div>
        </li>
        );
      })}
    </ul>
  );
}
