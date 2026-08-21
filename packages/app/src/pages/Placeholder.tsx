/** 占位页(U2 路由骨架阶段):居中显示页面名 + 迁移提示 */
interface PlaceholderPageProps {
  title: string;
}

const PlaceholderPage = ({ title }: PlaceholderPageProps) => (
  <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2">
    <p className="text-2xl font-semibold text-[var(--met-fg)]">{title}</p>
    <p className="text-sm text-[var(--met-fg-dim)]">U3 迁移中</p>
  </div>
);

export default PlaceholderPage;
