import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * 可展开长文本(专辑/歌单简介):默认两行截断,溢出时出现「展开」箭头,
 * 点击在原地向下弹开全文(替代原生 title tooltip 的信息框)。
 */
export const ExpandableText = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement | null>(null);

  // 判断截断态下是否真的溢出(不溢出则不渲染展开钮)
  useEffect(() => {
    setExpanded(false);
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  const toggleable = overflowing || expanded;

  return (
    <div className="min-w-0">
      <p
        ref={ref}
        className={`text-sm whitespace-pre-line text-[var(--met-fg-dim)] ${
          expanded ? "" : "line-clamp-2"
        }`}
      >
        {text}
      </p>
      {toggleable && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 flex cursor-pointer items-center gap-0.5 text-xs text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-primary)]"
        >
          {expanded ? "收起" : "展开"}
          <ChevronDown
            size={13}
            className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      )}
    </div>
  );
};
