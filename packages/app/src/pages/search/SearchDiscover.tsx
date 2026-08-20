/**
 * 搜索页空关键词形态:搜索历史 + 热搜榜(旧版无此页面级形态,
 * 数据与顶栏 SearchSuggest 聚焦面板同源 —— queryKey 共享缓存)。
 * 点击任一词条即以其为关键词进入当前搜索子 tab。
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame, History, Trash2 } from "lucide-react";
import { api } from "@met/core";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { setSearchHistory } from "@/components/search-suggest/SearchSuggest";
import { clearSearchHistory, useSiteDataStore } from "@/stores/siteData";
import { useSettingsStore } from "@/stores/settings";

/** 热搜条目(与 SearchSuggest 的宽松容错口径一致) */
interface SearchHotItem {
  searchWord?: string;
  content?: string;
  iconType?: number;
  iconUrl?: string | null;
}

export default function SearchDiscover() {
  const navigate = useNavigate();
  const searchHistory = useSiteDataStore((s) => s.searchHistory);
  const showSearchHistory = useSettingsStore((s) => s.showSearchHistory);
  const [clearOpen, setClearOpen] = useState(false);

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

  const historyVisible = showSearchHistory && searchHistory.length > 0;

  return (
    <div className="flex flex-col gap-8 pt-4">
      {/* 搜索历史 */}
      {historyVisible && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--met-fg)]">
              <History size={16} className="text-[var(--met-fg-dim)]" aria-hidden />
              搜索历史
            </h2>
            <button
              type="button"
              title="清空搜索历史"
              onClick={() => setClearOpen(true)}
              className="flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs text-[var(--met-fg-dim)] transition-colors hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-fg)]"
            >
              <Trash2 size={13} aria-hidden />
              清空
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {searchHistory.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => searchWord(word)}
                className="max-w-full cursor-pointer truncate rounded-full bg-[var(--met-bg-elevated)] px-3.5 py-1.5 text-[13px] text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-primary)]"
              >
                {word}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 热搜榜 */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-[var(--met-fg)]">
          <Flame size={16} className="text-[var(--met-fg-dim)]" aria-hidden />
          热搜榜
        </h2>
        {isLoading ? (
          <div className="grid animate-pulse grid-cols-1 gap-2 md:grid-cols-2">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="h-12 rounded-lg bg-[var(--met-bg-elevated)]" />
            ))}
          </div>
        ) : hotItems.length ? (
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {hotItems.map((item, i) => (
              <button
                key={`${item.searchWord}-${i}`}
                type="button"
                onClick={() => searchWord(item.searchWord as string)}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--met-bg-hover)]"
              >
                {/* 序号:前三名主题色加粗(对齐旧 SearchHot.vue) */}
                <span
                  className={`w-6 shrink-0 text-center text-sm font-semibold tabular-nums ${
                    i < 3 ? "text-[var(--met-primary)]" : "text-[var(--met-fg-dim)]"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-[var(--met-fg)]">
                      {item.searchWord}
                    </span>
                    {item.iconUrl ? (
                      <span
                        className={`shrink-0 rounded-sm px-1 text-[10px] font-bold leading-4 ${
                          item.iconType === 1
                            ? "bg-[var(--met-danger)]/15 text-[var(--met-danger)]"
                            : "bg-[var(--met-primary)]/15 text-[var(--met-primary)]"
                        }`}
                      >
                        {item.iconType === 1 ? "HOT" : "UP"}
                      </span>
                    ) : null}
                  </span>
                  {item.content ? (
                    <span className="truncate text-xs text-[var(--met-fg-dim)]">
                      {item.content}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="py-6 text-sm text-[var(--met-fg-dim)]">热搜榜暂时拉取不到,稍后再来看看</p>
        )}
      </section>

      {/* 清空历史二次确认(对齐 SearchSuggest 面板行为) */}
      <Dialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="清空搜索历史"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setClearOpen(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                clearSearchHistory();
                setClearOpen(false);
              }}
            >
              清空
            </Button>
          </>
        }
      >
        确认清空全部搜索历史？
      </Dialog>
    </div>
  );
}
