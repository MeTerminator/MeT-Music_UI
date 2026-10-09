import { useRef, type MouseEvent, type TouchEvent } from "react";

/** 保留轻点跳转,阻止拖动回到起点、长按及多指手势产生的点击。 */
export function useLyricTouchGuard() {
  const gesture = useRef({ x: 0, y: 0, started: 0, moved: false, suppressUntil: 0 });
  const trackMovement = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (touch && Math.hypot(touch.clientX - gesture.current.x, touch.clientY - gesture.current.y) > 10) {
      gesture.current.moved = true;
    }
    if (event.touches.length > 1) gesture.current.moved = true;
  };
  return {
    onTouchStartCapture: (event: TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      if (!touch) return;
      gesture.current = {
        x: touch.clientX, y: touch.clientY, started: performance.now(),
        moved: event.touches.length !== 1, suppressUntil: 0,
      };
    },
    onTouchMoveCapture: trackMovement,
    onTouchEndCapture: (event: TouchEvent<HTMLDivElement>) => {
      trackMovement(event);
      if (gesture.current.moved || performance.now() - gesture.current.started > 500) {
        gesture.current.suppressUntil = performance.now() + 800;
      }
    },
    onTouchCancelCapture: () => {
      gesture.current.suppressUntil = performance.now() + 800;
    },
    onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
      // AMLL 的 touchend 会同步调用 HTMLElement.click(),同样经过捕获阶段。
      if (performance.now() < gesture.current.suppressUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
