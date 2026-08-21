/**
 * 状态页(404/403/500 共用):大号数字 + 标题 + 旧页文案 + 操作按钮。
 * 对照旧 src/views/State/{403,404,500}.vue(n-result):
 * 403/404 为「返回上一级」(router.go(-1)),500 为「重新载入」。
 */
interface StatePageProps {
  code: string;
  title: string;
  /** 旧页 description 文案(如 404 的「怎么跑到这来了？」) */
  description: string;
  actionLabel: string;
  onAction: () => void;
}

const StatePage = ({ code, title, description, actionLabel, onAction }: StatePageProps) => (
  <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3">
    <p className="text-7xl font-bold tracking-widest text-[var(--met-primary)]">{code}</p>
    <p className="text-base font-medium text-[var(--met-fg)]">{title}</p>
    <p className="text-sm text-[var(--met-fg-dim)]">{description}</p>
    <button
      type="button"
      onClick={onAction}
      className="mt-2 cursor-pointer rounded-full border border-[var(--met-border)] px-5 py-1.5 text-sm text-[var(--met-fg)] transition-colors hover:border-[var(--met-primary)] hover:text-[var(--met-primary)]"
    >
      {actionLabel}
    </button>
  </div>
);

export default StatePage;
