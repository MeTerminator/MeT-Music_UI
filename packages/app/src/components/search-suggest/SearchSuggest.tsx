/**
 * 顶栏搜索框 + 搜索建议下拉。
 *
 * 旧 SearchInp.vue + SearchSuggestions.vue 的 React 合并移植:
 * - 输入 ≥1 字符后 300ms 防抖调用 api.getSearchSuggest(react-query 按关键词缓存);
 * - 下拉按接口返回的 result.order 分组渲染(单曲/歌手/专辑/歌单,与旧组件一致);
 * - 回车 / 点击「直接搜索」行 → /search/songs?keywords=(写入搜索历史,对齐旧 toSearch "song");
 * - 歌手 → /artist?id=,专辑 → /album?id=,歌单 → /playlist?id=(对齐旧 toSearch 各分支);
 * - 单曲 → /song?id=(旧组件此分支将歌曲 id 当关键词整词搜索,属旧实现缺陷,此处改跳歌曲详情页);
 * - Esc / 点击外部关闭;上下键循环高亮 + 回车选中(默认高亮「直接搜索」行);
 * - 聚焦且关键词为空时显示聚焦面板(旧 SearchHot.vue):搜索历史 tag 流
 *   (settings.showSearchHistory 开启且非空时,带「清空」二次确认)+ 热搜榜
 *   (api.getSearchHot,10 分钟缓存对齐旧 getCacheData("searchHot", 10)),
 *   点击任意条目即整词搜索。
 *
 * P2 补齐(对照旧 SearchInp.vue):
 * - 聚焦展宽动画(260 → 360px,transition;窄屏由外层 flex 收缩自适应);
 * - 聚焦时全屏半透明模糊遮罩(z 低于下拉面板,点击遮罩收起;
 *   <640px 遮罩透明无模糊,对齐旧 <512px 媒体查询意图);
 * - 提交词为 114514 时跳转 /test 彩蛋(旧 toSearch 110 行)。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@met/core";
import {
  Disc,
  Flame,
  History,
  ListMusic,
  Loader2,
  MicVocal,
  Music,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useSettingsStore } from "@/stores/settings";
import { clearSearchHistory, useSiteDataStore } from "@/stores/siteData";

/** 建议分组配置(对齐旧 searchSuggestionsType:songs/artists/albums/playlists) */
const SUGGEST_GROUPS = {
  songs: { name: "单曲", icon: Music },
  artists: { name: "歌手", icon: MicVocal },
  albums: { name: "专辑", icon: Disc },
  playlists: { name: "歌单", icon: ListMusic },
} as const;

type SuggestGroupKey = keyof typeof SUGGEST_GROUPS;

/** 单条建议(字段按 /search/suggest 实际响应,宽松容错) */
interface SuggestItem {
  id: number | string;
  name?: string;
  /** 单曲:歌手列表 */
  artists?: { name?: string }[];
  /** 专辑:歌手 */
  artist?: { name?: string };
}

/** result 数据体:order 为分组渲染顺序 */
type SuggestResult = Partial<Record<SuggestGroupKey, SuggestItem[]>> & {
  order?: string[];
};

/** 热搜条目(字段按 /search/hot/detail 实际响应,宽松容错) */
interface SearchHotItem {
  searchWord?: string;
  /** 热度(接口返回字符串数字) */
  score?: number | string;
  /** 副标题描述 */
  content?: string;
  /** 1 = HOT,其他非 0 = UP(仅 iconUrl 存在时展示,对齐旧 SearchHot.vue) */
  iconType?: number;
  iconUrl?: string | null;
}

/** 键盘导航的扁平条目:首位固定为「直接搜索」行 */
type FlatEntry =
  | { kind: "direct" }
  | { kind: "item"; group: SuggestGroupKey; item: SuggestItem };

/** 写入搜索历史(对齐旧 setSearchHistory:去重置顶,上限 30 条;搜索页发现面板复用) */
export const setSearchHistory = (name: string): void => {
  const trimmed = name.trim();
  if (!trimmed) return;
  useSiteDataStore.setState((s) => {
    const next = [trimmed, ...s.searchHistory.filter((item) => item !== trimmed)];
    return { searchHistory: next.slice(0, 30) };
  });
};

const SearchSuggest = () => {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [keywords, setKeywords] = useState("");
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const searchHistory = useSiteDataStore((s) => s.searchHistory);
  const showSearchHistory = useSettingsStore((s) => s.showSearchHistory);

  const kw = keywords.trim();

  // 300ms 防抖(对齐旧 debounce(getSearchSuggestData, 300))
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(kw), 300);
    return () => window.clearTimeout(timer);
  }, [kw]);

  const { data, isFetching } = useQuery({
    queryKey: ["searchSuggest", debounced],
    queryFn: () => api.getSearchSuggest(debounced),
    enabled: debounced.length >= 1,
    staleTime: 5 * 60 * 1000,
  });

  // 热搜榜(聚焦且无关键词时拉取;10 分钟缓存对齐旧 getCacheData("searchHot", 10))
  const { data: hotRaw } = useQuery({
    queryKey: ["searchHot"],
    queryFn: () => api.getSearchHot(),
    enabled: open && kw.length === 0,
    staleTime: 10 * 60 * 1000,
  });

  // 原始接口字段访问豁免点(data 体为热搜数组)
  const hotItems = useMemo<SearchHotItem[]>(() => {
    const list = (hotRaw as any)?.data; // eslint-disable-line @typescript-eslint/no-explicit-any
    return Array.isArray(list)
      ? (list as SearchHotItem[]).filter((item) => item?.searchWord)
      : [];
  }, [hotRaw]);

  // 原始接口字段访问豁免点
  const result = useMemo<SuggestResult | undefined>(() => {
    if (debounced.length < 1 || debounced !== kw) return undefined;
    return (data as any)?.result as SuggestResult | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  }, [data, debounced, kw]);

  // 扁平键盘导航列表 + 分组渲染结构(带扁平下标,便于高亮联动)
  const { flat, sections } = useMemo(() => {
    const flatList: FlatEntry[] = [{ kind: "direct" }];
    const sectionList: {
      key: SuggestGroupKey;
      rows: { item: SuggestItem; index: number }[];
    }[] = [];
    for (const key of result?.order ?? []) {
      if (!(key in SUGGEST_GROUPS)) continue;
      const groupKey = key as SuggestGroupKey;
      const items = result?.[groupKey] ?? [];
      if (items.length === 0) continue;
      const rows = items.map((item) => {
        const index = flatList.length;
        flatList.push({ kind: "item", group: groupKey, item });
        return { item, index };
      });
      sectionList.push({ key: groupKey, rows });
    }
    return { flat: flatList, sections: sectionList };
  }, [result]);

  // 建议列表变化时重置高亮至「直接搜索」行
  useEffect(() => {
    setHighlight(0);
  }, [flat.length, debounced]);

  // 点击外部关闭(清空历史确认框展示期间豁免:Dialog 为 Portal,位于 rootRef 之外)
  useEffect(() => {
    if (!open || clearDialogOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, clearDialogOpen]);

  const close = () => {
    setOpen(false);
    inputRef.current?.blur();
  };

  // 整词搜索(对齐旧 toSearch "song" 分支)
  const goDirectSearch = (value: string) => {
    const target = value.trim();
    if (!target) return;
    // 114514 彩蛋(旧 toSearch:Number(val) === 114514 → /test,不写入历史)
    if (Number(target) === 114514) {
      close();
      void navigate({ to: "/test" });
      return;
    }
    setSearchHistory(target);
    close();
    void navigate({ to: "/search/songs", search: { keywords: target } });
  };

  // 选中某个扁平条目
  const selectEntry = (entry: FlatEntry) => {
    if (entry.kind === "direct") {
      goDirectSearch(kw);
      return;
    }
    const id = String(entry.item.id);
    close();
    switch (entry.group) {
      case "songs":
        setSearchHistory(entry.item.name ?? "");
        void navigate({ to: "/song", search: { id } });
        break;
      case "artists":
        void navigate({ to: "/artist", search: { id } });
        break;
      case "albums":
        void navigate({ to: "/album", search: { id } });
        break;
      case "playlists":
        void navigate({ to: "/playlist", search: { id } });
        break;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const entry = open ? flat[highlight] : undefined;
      if (entry) selectEntry(entry);
      else goDirectSearch(kw);
      return;
    }
    if (!open || flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => (i - 1 + flat.length) % flat.length);
    }
  };

  const showPanel = open && kw.length >= 1;
  const loading = isFetching && sections.length === 0;
  const empty = !isFetching && result !== undefined && sections.length === 0;

  // 聚焦面板(旧 SearchHot.vue):关键词为空时展示历史 + 热搜,任一有内容才显示
  const historyVisible = showSearchHistory && searchHistory.length > 0;
  const showFocusPanel =
    open && kw.length === 0 && (historyVisible || hotItems.length > 0);

  return (
    <div
      ref={rootRef}
      className={`relative w-full transition-[max-width] duration-300 ${
        open ? "max-w-[360px]" : "max-w-[260px]"
      }`}
    >
      {/* 聚焦遮罩(旧 .search-mask:全屏半透明 + 模糊,点击收起;
          z 低于输入框与下拉面板;<640px 透明无模糊) */}
      {open && (
        <div
          aria-hidden
          onClick={close}
          className="fixed inset-0 z-30 bg-black/25 backdrop-blur-xl max-sm:bg-transparent max-sm:backdrop-blur-none"
        />
      )}
      {/* 搜索输入框(z 高于遮罩) */}
      <div className="relative z-40">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--met-fg-dim)]"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="text"
          value={keywords}
          role="combobox"
          aria-expanded={showPanel}
          aria-label="搜索"
          onChange={(e) => {
            setKeywords(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="搜索音乐 / 歌手 / 专辑"
          className="h-9 w-full rounded-full border border-[var(--met-border)] bg-[var(--met-bg-elevated)] pr-4 pl-9 text-sm text-[var(--met-fg)] outline-none transition-colors placeholder:text-[var(--met-fg-dim)] focus:border-[var(--met-primary)]"
        />
      </div>

      {/* 建议下拉面板 */}
      {showPanel && (
        <div
          role="listbox"
          className="absolute top-11 left-1/2 z-40 max-h-[min(60vh,480px)] w-full -translate-x-1/2 overflow-y-auto rounded-xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] p-2 shadow-2xl"
        >
          {/* 直接搜索(固定首行,对齐旧组件 .direct) */}
          <button
            type="button"
            role="option"
            aria-selected={highlight === 0}
            onMouseEnter={() => setHighlight(0)}
            onClick={() => goDirectSearch(kw)}
            className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--met-fg)] transition-colors ${
              highlight === 0 ? "bg-[var(--met-bg-hover)]" : ""
            }`}
          >
            <Search className="h-4 w-4 shrink-0 text-[var(--met-fg-dim)]" aria-hidden />
            <span className="truncate">直接搜索：{kw}</span>
          </button>

          {/* 加载中 */}
          {loading && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--met-fg-dim)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              正在获取搜索建议…
            </div>
          )}

          {/* 空态 */}
          {empty && (
            <div className="px-3 py-3 text-sm text-[var(--met-fg-dim)]">暂无相关搜索建议</div>
          )}

          {/* 分组建议(按 result.order 渲染) */}
          {sections.map(({ key, rows }) => {
            const { name, icon: GroupIcon } = SUGGEST_GROUPS[key];
            return (
              <div key={key} className="mt-2">
                <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-[var(--met-primary)]">
                  <GroupIcon className="h-3.5 w-3.5" aria-hidden />
                  {name}
                </div>
                {rows.map(({ item, index }) => {
                  const sub =
                    key === "songs"
                      ? item.artists?.map((a) => a.name).filter(Boolean).join(" / ")
                      : key === "albums"
                        ? item.artist?.name
                        : undefined;
                  return (
                    <button
                      key={`${key}-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={highlight === index}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => selectEntry({ kind: "item", group: key, item })}
                      className={`flex w-full cursor-pointer items-baseline gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                        highlight === index ? "bg-[var(--met-bg-hover)]" : ""
                      }`}
                    >
                      <span className="truncate text-sm text-[var(--met-fg)]">{item.name}</span>
                      {sub && (
                        <span className="truncate text-xs text-[var(--met-fg-dim)]">{sub}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* 聚焦面板:搜索历史 + 热搜榜(旧 SearchHot.vue,聚焦且关键词为空时) */}
      {showFocusPanel && (
        <div className="absolute top-11 left-1/2 z-40 max-h-[min(60vh,480px)] w-full -translate-x-1/2 overflow-y-auto rounded-xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] p-3 shadow-2xl">
          {/* 搜索历史 */}
          {historyVisible && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 px-1 text-xs font-semibold text-[var(--met-primary)]">
                <History className="h-3.5 w-3.5" aria-hidden />
                搜索历史
                <button
                  type="button"
                  title="清空搜索历史"
                  onClick={() => setClearDialogOpen(true)}
                  className="ml-auto flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 font-normal text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  清空
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 px-1">
                {searchHistory.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => goDirectSearch(item)}
                    className="max-w-full cursor-pointer truncate rounded-full bg-[var(--met-bg-hover)] px-3 py-1 text-[13px] text-[var(--met-fg)] transition-colors hover:text-[var(--met-primary)]"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 热搜榜 */}
          {hotItems.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-[var(--met-primary)]">
                <Flame className="h-3.5 w-3.5" aria-hidden />
                热搜榜
              </div>
              {hotItems.map((item, index) => (
                <button
                  key={`${index}-${item.searchWord}`}
                  type="button"
                  onClick={() => goDirectSearch(item.searchWord ?? "")}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--met-bg-hover)]"
                >
                  <span
                    className={`w-7 shrink-0 text-center text-base font-bold ${
                      index < 3 ? "text-[var(--met-primary)]" : "text-[var(--met-fg-dim)]"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center">
                      <span className="truncate text-sm text-[var(--met-fg)]">
                        {item.searchWord}
                      </span>
                      {item.iconUrl && (
                        <span
                          className={`ml-2 shrink-0 rounded-full px-1.5 text-[10px] font-bold ${
                            item.iconType === 1
                              ? "bg-[var(--met-danger)]/15 text-[var(--met-danger)]"
                              : "bg-[var(--met-primary)]/15 text-[var(--met-primary)]"
                          }`}
                        >
                          {item.iconType === 1 ? "HOT" : "UP"}
                        </span>
                      )}
                      {item.score != null && item.score !== "" && (
                        <span className="ml-auto shrink-0 pl-2 text-xs text-[var(--met-fg-dim)] italic">
                          {item.score}
                        </span>
                      )}
                    </span>
                    {item.content && (
                      <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--met-fg-dim)]">
                        {item.content}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 清空历史二次确认(文案对照旧 $dialog.warning) */}
      <Dialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        title="删除历史"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setClearDialogOpen(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                clearSearchHistory();
                setClearDialogOpen(false);
              }}
            >
              确认
            </Button>
          </>
        }
      >
        确认删除全部的搜索历史？这将无法恢复！
      </Dialog>
    </div>
  );
};

export default SearchSuggest;
