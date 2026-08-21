import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

export interface ScrollRowProps {
  children: ReactNode;
  /** 滚动容器的样式(横滑行本身的 flex / gap / snap 等) */
  className?: string;
  /** 滚动条的无障碍名称 */
  ariaLabel?: string;
}

/** 单次方向键滚动的距离(px),约等于一张封面卡的宽度 */
const ARROW_STEP = 160;

/**
 * 带自绘横向滚动条的横滑行。
 *
 * 原生滚动条在 macOS 上是叠加式的(不滚动就完全不可见),窄轨横滑行里根本
 * 看不出"还能往右划";这里在行下方常驻一条细滚动条:
 * 宽度按可视比例、位置跟随 scrollLeft,可直接拖动滑块或点击轨道跳转。
 * 内容不足以滚动时整条隐藏(不占布局高度)。
 */
export const ScrollRow = ({ children, className = "", ariaLabel }: ScrollRowProps) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  /** thumbRatio:滑块宽度占轨道比例;offsetRatio:滑块左端占轨道比例 */
  const [{ thumbRatio, offsetRatio }, setMetrics] = useState({
    thumbRatio: 1,
    offsetRatio: 0,
  });
  const [dragging, setDragging] = useState(false);

  const measure = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    // 1px 容差:布局取整会让 scrollWidth 比 clientWidth 大一点点
    const maxScroll = scrollWidth - clientWidth;
    const canScroll = maxScroll > 1;
    const ratio = canScroll ? clientWidth / scrollWidth : 1;
    // 滑块在轨道内的可移动范围是 (1 - ratio),按已滚动比例分配
    const offset = canScroll ? (scrollLeft / maxScroll) * (1 - ratio) : 0;
    // 值未变时必须返回原对象:本函数在每次渲染后都会跑一遍,
    // 每次都 setState 新对象会把组件打进无限重渲染。
    setMetrics((prev) =>
      prev.thumbRatio === ratio && prev.offsetRatio === offset
        ? prev
        : { thumbRatio: ratio, offsetRatio: offset },
    );
  }, []);

  // 每次渲染后重新测量(字体加载、图片布局、列表增删都会改 scrollWidth);
  // measure 内部做了同值短路,不会形成更新循环。
  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const scrollable = thumbRatio < 1;

  /** 把轨道上的一个位置比例换算成 scrollLeft 并滚过去 */
  const scrollToTrackRatio = (ratio: number, smooth: boolean): void => {
    const el = viewportRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const clamped = Math.min(1, Math.max(0, ratio));
    el.scrollTo({ left: clamped * maxScroll, behavior: smooth ? "smooth" : "auto" });
  };

  /** 拖动滑块:按指针在轨道上的位移比例换算滚动位置 */
  const onThumbPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const track = trackRef.current;
    const el = viewportRef.current;
    if (!track || !el) return;
    e.preventDefault();
    e.stopPropagation();
    const trackWidth = track.clientWidth;
    const maxScroll = el.scrollWidth - el.clientWidth;
    // 滑块可移动的轨道长度(滑块自身占了 thumbRatio,剩下的才是行程)
    const travel = trackWidth * (1 - thumbRatio);
    if (travel <= 0) return;
    const startX = e.clientX;
    const startScroll = el.scrollLeft;
    setDragging(true);

    const onMove = (ev: PointerEvent): void => {
      el.scrollLeft = startScroll + ((ev.clientX - startX) / travel) * maxScroll;
    };
    const onUp = (): void => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  /** 点击轨道空白处:把滑块中心移到点击位置 */
  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const hit = (e.clientX - rect.left) / rect.width;
    // 换算成"滑块中心对齐点击处"的滚动比例
    scrollToTrackRatio((hit - thumbRatio / 2) / (1 - thumbRatio), true);
  };

  const onTrackKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const el = viewportRef.current;
    if (!el) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      el.scrollBy({
        left: e.key === "ArrowLeft" ? -ARROW_STEP : ARROW_STEP,
        behavior: "smooth",
      });
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      scrollToTrackRatio(e.key === "Home" ? 0 : 1, true);
    }
  };

  return (
    <div>
      <div ref={viewportRef} className={className}>
        {children}
      </div>
      {/* 滚动条:不可滚动时整条隐藏,不占高度 */}
      {scrollable ? (
        <div
          ref={trackRef}
          role="scrollbar"
          aria-label={ariaLabel}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(
            thumbRatio < 1 ? (offsetRatio / (1 - thumbRatio)) * 100 : 0,
          )}
          tabIndex={0}
          onPointerDown={onTrackPointerDown}
          onKeyDown={onTrackKeyDown}
          className="group relative mt-1 h-1.5 w-full cursor-pointer rounded-full bg-[var(--met-border)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--met-primary)]"
        >
          <div
            onPointerDown={onThumbPointerDown}
            className={`absolute top-0 h-full rounded-full transition-colors ${
              dragging
                ? "bg-[var(--met-primary)]"
                : "bg-[var(--met-fg-dim)] group-hover:bg-[var(--met-primary)]"
            }`}
            style={{
              width: `${thumbRatio * 100}%`,
              left: `${offsetRatio * 100}%`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
};

export default ScrollRow;
