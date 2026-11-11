export interface OutputContext {
  currentTime: number;
  baseLatency?: number;
  outputLatency?: number;
  getOutputTimestamp?(): { contextTime?: number; performanceTime?: number };
}

/** 把声卡输出位置映射回 AudioContext 时间轴，不重复叠加输出延迟。 */
export function outputContextTime(context: OutputContext, now: number): number {
  try {
    const stamp = context.getOutputTimestamp?.();
    if (stamp && Number.isFinite(stamp.contextTime) && stamp.contextTime! >= 0 &&
        Number.isFinite(stamp.performanceTime) && stamp.performanceTime! > 0 &&
        Math.abs(now - stamp.performanceTime!) <= 1000) {
      return Math.max(0, Math.min(context.currentTime,
        stamp.contextTime! + (now - stamp.performanceTime!) / 1000));
    }
  } catch { /* 部分浏览器尚未实现输出时间戳，使用其延迟属性。 */ }
  const positive = (value?: number) => Number.isFinite(value) && value! > 0 ? value! : 0;
  return Math.max(0, context.currentTime - positive(context.baseLatency) - positive(context.outputLatency));
}

export interface OutputPoint {
  contextTime: number;
  position: number;
  playing: boolean;
  waiting: boolean;
  ended: boolean;
}

/**
 * 渲染位置与已听到的位置分开保存。使用实际渲染点插值，避免在倍速、
 * 缓冲空洞、暂停或跳转时简单减去固定秒数而产生新的偏移。
 */
export class PcmOutputClock {
  private points: OutputPoint[] = [];
  private floor = 0;
  private lastPosition = 0;

  reset(position: number): void {
    this.points = [];
    this.floor = this.lastPosition = position;
  }

  push(point: OutputPoint): void {
    if (!Number.isFinite(point.contextTime) || !Number.isFinite(point.position)) return;
    const last = this.points.at(-1);
    if (last && point.contextTime < last.contextTime) return;
    if (last?.contextTime === point.contextTime) this.points[this.points.length - 1] = point;
    else this.points.push(point);
    if (this.points.length > 1024) this.points.shift();
  }

  read(contextTime: number): { position: number; waiting: boolean; ended: boolean } {
    const first = this.points[0];
    if (!first || contextTime < first.contextTime) {
      return { position: this.lastPosition, waiting: true, ended: false };
    }
    // 保留输出位置之前的最后一个点及全部尚在输出队列中的点。
    let index = 0;
    while (index + 1 < this.points.length && this.points[index + 1].contextTime <= contextTime) index++;
    if (index) this.points.splice(0, index);
    const before = this.points[0];
    const after = this.points[1];
    let position = before.position;
    if (after && before.playing && !before.waiting && !before.ended) {
      const ratio = (contextTime - before.contextTime) / (after.contextTime - before.contextTime);
      position += (after.position - before.position) * Math.max(0, Math.min(1, ratio));
    }
    // 输出路由改变或时间戳精度波动时保持歌词不倒退；显式 seek 会 reset。
    this.lastPosition = Math.max(this.lastPosition, position, this.floor);
    return { position: this.lastPosition, waiting: before.waiting || !before.playing && !before.ended,
      ended: before.ended };
  }
}
