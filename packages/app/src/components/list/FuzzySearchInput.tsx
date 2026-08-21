import { Search } from "lucide-react";

/** 列表页模糊搜索输入框(Album / Playlist 共用;聚焦展宽,前缀搜索图标) */
export const FuzzySearchInput = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => (
  <div className="relative">
    <Search
      size={15}
      className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--met-fg-dim)]"
      aria-hidden
    />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="模糊搜索"
      className="h-9 w-36 rounded-full border border-[var(--met-border)] bg-transparent pr-4 pl-9 text-sm text-[var(--met-fg)] outline-none transition-all placeholder:text-[var(--met-fg-dim)] focus:w-52 focus:border-[var(--met-primary)]"
    />
  </div>
);
