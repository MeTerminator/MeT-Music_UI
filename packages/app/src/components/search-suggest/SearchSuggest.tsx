/**
 * 顶栏搜索框 + 搜索建议下拉。
 *
 * 旧 SearchInp.vue + SearchSuggestions.vue 的 React 合并移植:
 * - 输入 ≥1 字符后 300ms 防抖调用 api.getSearchSuggest(react-query 按关键词缓存);
 * - 下拉按接口返回的 result.order 分组渲染(单曲/歌手/专辑/歌单,与旧组件一致);
 * - 回车 / 点击「直接搜索」行 → /search/songs?keywords=(写入搜索历史,对齐旧 toSearch "song");
 * - 歌手 → /artist?id=,专辑 → /album?id=,歌单 → /playlist?id=(对齐旧 toSearch 各分支);
 * - 单曲 → /song?id=(旧组件此分支将歌曲 id 当关键词整词搜索,属旧实现缺陷,此处改跳歌曲详情页);
 * - Esc / 点击外部关闭;上下键循环高亮 + 回车选中(默认高亮「直接搜索」行)。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@met/core";
import { Disc, ListMusic, Loader2, MicVocal, Music, Search } from "lucide-react";
import { useSiteDataStore } from "@/stores/siteData";

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

/** 键盘导航的扁平条目:首位固定为「直接搜索」行 */
type FlatEntry =
  | { kind: "direct" }
  | { kind: "item"; group: SuggestGroupKey; item: SuggestItem };

/** 写入搜索历史(对齐旧 setSearchHistory:去重置顶,上限 30 条) */
const setSearchHistory = (name: string): void => {
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

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    inputRef.current?.blur();
  };

  // 整词搜索(对齐旧 toSearch "song" 分支)
  const goDirectSearch = (value: string) => {
    const target = value.trim();
    if (!target) return;
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

  return (
    <div ref={rootRef} className="relative w-full max-w-md">
      {/* 搜索输入框 */}
      <div className="relative">
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
    </div>
  );
};

export default SearchSuggest;
