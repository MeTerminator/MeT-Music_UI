import { Link } from "@tanstack/react-router";

/** 状态页(404/403/500 共用):大号数字 + 返回主页链接 */
interface StatePageProps {
  code: string;
  message: string;
}

const StatePage = ({ code, message }: StatePageProps) => (
  <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3">
    <p className="text-7xl font-bold tracking-widest text-[var(--met-primary)]">{code}</p>
    <p className="text-sm text-[var(--met-fg-dim)]">{message}</p>
    <Link
      to="/"
      className="mt-2 rounded-full border border-[var(--met-border)] px-5 py-1.5 text-sm text-[var(--met-fg)] transition-colors hover:border-[var(--met-primary)] hover:text-[var(--met-primary)]"
    >
      返回主页
    </Link>
  </div>
);

export default StatePage;
