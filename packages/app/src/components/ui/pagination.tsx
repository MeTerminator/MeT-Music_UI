/**
 * 简洁分页(对照旧 src/components/Global/Pagination.vue 的 n-pagination:
 * 上一页 / 页码(带省略) / 下一页;改为完全受控组件)。
 */
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationProps {
  /** 当前页码(从 1 开始) */
  page: number;
  /** 总页数 */
  pageCount: number;
  /** 页码变化回调 */
  onChange: (page: number) => void;
  className?: string;
}

type PageItem = number | "ellipsis";

/** 生成页码序列(首尾恒显,当前页 ±1,超出以省略号折叠) */
const buildPageItems = (page: number, pageCount: number): PageItem[] => {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const items: PageItem[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) items.push("ellipsis");
  for (let i = start; i <= end; i++) items.push(i);
  if (end < pageCount - 1) items.push("ellipsis");
  items.push(pageCount);
  return items;
};

const itemBaseCls =
  "flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-sm tabular-nums transition-colors";

/** 主分页(总页数 <= 1 时不渲染,与旧组件 v-if 行为一致) */
export const Pagination = ({ page, pageCount, onChange, className = "" }: PaginationProps) => {
  if (pageCount <= 1) return null;

  const goTo = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), pageCount);
    if (clamped !== page) onChange(clamped);
  };

  return (
    <nav
      aria-label="分页"
      className={`mt-10 mb-8 flex items-center justify-center gap-1 ${className}`}
    >
      {/* 上一页 */}
      <button
        type="button"
        aria-label="上一页"
        disabled={page <= 1}
        onClick={() => goTo(page - 1)}
        className={`${itemBaseCls} cursor-pointer text-[var(--met-fg-dim)] hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-fg)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>

      {/* 页码 */}
      {buildPageItems(page, pageCount).map((item, index) =>
        item === "ellipsis" ? (
          <span
            key={`ellipsis-${index}`}
            className={`${itemBaseCls} select-none text-[var(--met-fg-dim)]`}
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-label={`第 ${item} 页`}
            aria-current={item === page ? "page" : undefined}
            onClick={() => goTo(item)}
            className={`${itemBaseCls} cursor-pointer ${
              item === page
                ? "bg-[var(--met-primary)] font-medium text-[var(--met-primary-fg)]"
                : "text-[var(--met-fg)] hover:bg-[var(--met-bg-hover)]"
            }`}
          >
            {item}
          </button>
        ),
      )}

      {/* 下一页 */}
      <button
        type="button"
        aria-label="下一页"
        disabled={page >= pageCount}
        onClick={() => goTo(page + 1)}
        className={`${itemBaseCls} cursor-pointer text-[var(--met-fg-dim)] hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-fg)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
};

export interface PrevNextPagerProps {
  /** 中间展示文案(如「第 3 页」或「3 / 10 页」) */
  label: string;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  className?: string;
}

const prevNextBtnCls =
  "rounded-full border border-[var(--met-border)] px-4 py-1.5 text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40";

/**
 * 简版「上一页 / 下一页」分页(总页数未知或游标分页场景;
 * 收敛 artist 三页与 Comments 页的手写 prev/next 块)。
 */
export const PrevNextPager = ({
  label,
  onPrev,
  onNext,
  prevDisabled = false,
  nextDisabled = false,
  className = "",
}: PrevNextPagerProps) => (
  <div className={`flex items-center justify-center gap-3 ${className}`}>
    <button type="button" disabled={prevDisabled} onClick={onPrev} className={prevNextBtnCls}>
      上一页
    </button>
    <span className="min-w-16 text-center text-xs text-[var(--met-fg-dim)]">{label}</span>
    <button type="button" disabled={nextDisabled} onClick={onNext} className={prevNextBtnCls}>
      下一页
    </button>
  </div>
);
