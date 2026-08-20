/**
 * 发现页(搜索页空关键词形态):热搜榜。
 * 数据与顶栏 SearchSuggest 聚焦面板同源(queryKey 共享 10 分钟缓存),
 * 点击任一词条即以其为关键词进入当前搜索子 tab。
 */
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { api } from "@met/core";
import { setSearchHistory } from "@/components/search-suggest/SearchSuggest";
import CoverCarousel from "./CoverCarousel";

/** 热搜条目(与 SearchSuggest 的宽松容错口径一致) */
interface SearchHotItem {
  searchWord?: string;
  content?: string;
  iconType?: number;
  iconUrl?: string | null;
}

export default function SearchDiscover() {
  const navigate = useNavigate();

  // 热搜榜(与 SearchSuggest 同 queryKey,10 分钟缓存共享)
  const { data: hotRaw, isLoading } = useQuery({
    queryKey: ["searchHot"],
    queryFn: () => api.getSearchHot(),
    staleTime: 10 * 60 * 1000,
  });

  // 原始接口字段访问豁免点(data 体为热搜数组)
  const hotItems = useMemo<SearchHotItem[]>(() => {
    const list = (hotRaw as any)?.data; // eslint-disable-line @typescript-eslint/no-explicit-any
    return Array.isArray(list)
      ? (list as SearchHotItem[]).filter((item) => item?.searchWord)
      : [];
  }, [hotRaw]);

  const searchWord = (word: string) => {
    setSearchHistory(word);
    // to: "." 保持当前搜索子 tab,仅更新关键词
    void navigate({ to: ".", search: { keywords: word } });
  };

  // 双列按列填充:1..half 在左列、其余在右列,序号纵向连续
  // (grid 默认行优先会变成 1左2右3左…,榜单读感左右横跳)
  const half = Math.ceil(hotItems.length / 2);
  const columns = [hotItems.slice(0, half), hotItems.slice(half)];

  return (
    <div className="pt-1">
      {/* 最近播放封面轮播横幅 */}
      <CoverCarousel />

      <section className="mt-6">
        <h2 className="mb-2 flex items-center gap-1.5 text-base font-semibold text-[var(--met-fg)]">
          <Flame size={16} className="text-[var(--met-danger)]" aria-hidden />
          热搜榜
        </h2>
      {isLoading ? (
        <div className="grid animate-pulse grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} className="h-8 rounded-md bg-[var(--met-bg-elevated)]" />
          ))}
        </div>
        ) : hotItems.length ? (
          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
            {columns.map((col, c) => (
              <div key={c} className="flex flex-col">
                {col.map((item, i) => {
                  const rank = c * half + i;
                  return (
                    <button
                      key={`${item.searchWord}-${rank}`}
                      type="button"
                      onClick={() => searchWord(item.searchWord as string)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--met-bg-hover)]"
                    >
                      {/* 序号:前三名主题色加粗(对齐旧 SearchHot.vue) */}
                      <span
                        className={`w-5 shrink-0 text-center text-[13px] font-semibold tabular-nums ${
                          rank < 3 ? "text-[var(--met-primary)]" : "text-[var(--met-fg-dim)]"
                        }`}
                      >
                        {rank + 1}
                      </span>
                      <span className="truncate text-[13px] font-medium text-[var(--met-fg)]">
                        {item.searchWord}
                      </span>
                      {item.iconUrl ? (
                        <span
                          className={`shrink-0 rounded-sm px-1 text-[10px] leading-4 font-bold ${
                            item.iconType === 1
                              ? "bg-[var(--met-danger)]/15 text-[var(--met-danger)]"
                              : "bg-[var(--met-primary)]/15 text-[var(--met-primary)]"
                          }`}
                        >
                          {item.iconType === 1 ? "HOT" : "UP"}
                        </span>
                      ) : null}
                      {item.content ? (
                        <span className="min-w-0 flex-1 truncate text-right text-[11px] text-[var(--met-fg-dim)]">
                          {item.content}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-sm text-[var(--met-fg-dim)]">
            热搜榜暂时拉取不到,稍后再来看看
          </p>
        )}
      </section>
    </div>
  );
}
