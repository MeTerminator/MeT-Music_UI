import { describe, expect, it } from 'vitest';
import { outputContextTime, PcmOutputClock, type OutputPoint } from '../src/player/nac/output-clock';

const point = (contextTime: number, position: number, extra: Partial<OutputPoint> = {}): OutputPoint => ({
  contextTime, position, playing: true, waiting: false, ended: false, ...extra,
});

describe('PCM 实际输出时钟', () => {
  it('通过声卡时间戳对齐耳机输出，不重复扣除 outputLatency', () => {
    const context = { currentTime: 10, baseLatency: 0.01, outputLatency: 0.25,
      getOutputTimestamp: () => ({ contextTime: 9.7, performanceTime: 990 }) };
    expect(outputContextTime(context, 1000)).toBeCloseTo(9.71);
  });

  it('没有有效时间戳时使用设备延迟，缺少 API 时保留渲染位置', () => {
    expect(outputContextTime({ currentTime: 10, baseLatency: 0.01, outputLatency: 0.25 }, 1000)).toBe(9.74);
    expect(outputContextTime({ currentTime: 10,
      getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) }, 1000)).toBe(10);
    expect(outputContextTime({ currentTime: 10,
      getOutputTimestamp: () => ({ contextTime: 1, performanceTime: 1 }), outputLatency: 0.2 }, 3000)).toBe(9.8);
    expect(outputContextTime({ currentTime: 0.1, outputLatency: 0.25 }, 1000)).toBe(0);
  });

  it('映射每个渲染块与输出设备的位置，耳机有延迟时不让歌词先走', () => {
    const clock = new PcmOutputClock();
    clock.reset(30);
    clock.push(point(10, 30));
    clock.push(point(10.5, 30.5));
    const outputTime = outputContextTime({ currentTime: 10.5, outputLatency: 0.25 }, 1000);
    expect(clock.read(outputTime)).toEqual({ position: 30.25, waiting: false, ended: false });
  });

  it('跳转后立即预览目标，等新音频到达输出端才继续推进', () => {
    const clock = new PcmOutputClock();
    clock.reset(0);
    clock.push(point(10, 5));
    clock.reset(60);
    clock.push(point(11, 60.01));
    clock.push(point(11.1, 60.11));
    expect(clock.read(10.8)).toEqual({ position: 60, waiting: true, ended: false });
    expect(clock.read(11.05).position).toBeCloseTo(60.06);
    clock.reset(3);
    expect(clock.read(11)).toEqual({ position: 3, waiting: true, ended: false });
  });

  it('倍速由实际采样轨迹决定；缓冲暂停与恢复也按输出端时间生效', () => {
    const clock = new PcmOutputClock();
    clock.reset(0);
    clock.push(point(10, 0));
    clock.push(point(10.5, 1));
    clock.push(point(11, 2, { waiting: true }));
    clock.push(point(13, 2, { waiting: true }));
    clock.push(point(13.1, 2.1));
    clock.push(point(13.2, 2.2));
    expect(clock.read(10.25).position).toBeCloseTo(0.5);
    expect(clock.read(11.5)).toEqual({ position: 2, waiting: true, ended: false });
    expect(clock.read(13.05)).toEqual({ position: 2, waiting: true, ended: false });
    expect(clock.read(13.15).position).toBeCloseTo(2.15);
  });

  it('末尾采样真正到达输出设备后才报告结束，避免提前切歌', () => {
    const clock = new PcmOutputClock();
    clock.reset(0);
    clock.push(point(10, 9));
    clock.push(point(11, 10, { playing: false, ended: true }));
    expect(clock.read(10.75)).toEqual({ position: 9.75, waiting: false, ended: false });
    expect(clock.read(11)).toEqual({ position: 10, waiting: false, ended: true });
  });

  it('切换输出设备时不回退到旧歌词，不外推越过尚未渲染的数据', () => {
    const clock = new PcmOutputClock();
    clock.reset(30);
    clock.push(point(10, 30));
    clock.push(point(11, 31));
    expect(clock.read(11).position).toBe(31);
    expect(clock.read(10.5).position).toBe(31);
    expect(clock.read(12).position).toBe(31);
  });
});
