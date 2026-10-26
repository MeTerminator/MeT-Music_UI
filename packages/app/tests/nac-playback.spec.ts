import { describe, expect, it } from 'vitest';
import { PCMPlayback } from '../src/player/nac/pcm-playback';
import type { AudioInfo, PCMChunk } from '../src/player/nac/types';

const short: AudioInfo = { samples: 4, rate: 4, duration: 1, blocks: 1, delay: 0 };
const data: PCMChunk = {
  block: 0,
  offset: 0,
  channels: [new Float32Array([0, 1, 0, -1]), new Float32Array([0, -1, 0, 1])],
};
const output = (frames: number): Float32Array[] => [
  new Float32Array(frames),
  new Float32Array(frames),
];

function setup(): PCMPlayback {
  const playback = new PCMPlayback();
  playback.command({ type: 'configure', fileId: 1, info: short });
  playback.command({ type: 'play', fileId: 1 });
  return playback;
}

describe('音频线程的分块缓存与随机访问', () => {
  it('倍速改变采样时钟，非法倍速恢复为正常速度', () => {
    const playback = setup();
    playback.command({ type: 'chunk', fileId: 1, chunk: data });
    playback.command({ type: 'rate', value: 2 });
    const out = output(2);
    playback.render(out, 4);
    expect(Array.from(out[0])).toEqual([0, 0]);
    expect(playback.state()).toMatchObject({ position: 4, ended: true });
    playback.command({ type: 'seek', fileId: 1, sample: 0, revision: 1 });
    playback.command({ type: 'rate', value: 0 });
    playback.command({ type: 'play', fileId: 1 });
    playback.render(out, 4);
    expect(Array.from(out[0])).toEqual([0, 1]);
    expect(playback.state().position).toBe(2);
  });

  it('未缓存片段只输出静音且保持位置，数据到达后自动恢复', () => {
    const playback = setup();
    const out = output(2);
    playback.render(out, 4);
    expect(Array.from(out[0])).toEqual([0, 0]);
    expect(playback.state()).toMatchObject({ waiting: true, position: 0, playing: true });
    playback.command({ type: 'chunk', fileId: 1, chunk: data });
    playback.render(out, 4);
    expect(Array.from(out[0])).toEqual([0, 1]);
    expect(playback.state()).toMatchObject({ waiting: false, position: 2 });
  });

  it('连续重采样保留跨渲染回调的小数相位', () => {
    const playback = setup();
    playback.command({ type: 'chunk', fileId: 1, chunk: data });
    const a = output(3),
      b = output(5);
    playback.render(a, 8);
    playback.render(b, 8);
    expect([...a[0], ...b[0]]).toEqual([0, 0.5, 1, 0.5, 0, -0.5, -1, -1]);
    expect(playback.state().ended).toBe(true);
  });

  it('暂停不消耗样本，seek 立即修改位置且不继承旧缓存的播放进度', () => {
    const playback = setup();
    playback.command({ type: 'chunk', fileId: 1, chunk: data });
    playback.command({ type: 'pause', fileId: 1 });
    playback.render(output(4), 4);
    expect(playback.state().position).toBe(0);
    playback.command({ type: 'seek', fileId: 1, sample: 3, revision: 1 });
    playback.command({ type: 'play', fileId: 1 });
    const out = output(1);
    playback.render(out, 4);
    expect(out[0][0]).toBe(-1);
  });

  it('跨块空洞处停止，补齐后一帧不漏地继续', () => {
    const playback = new PCMPlayback();
    playback.command({
      type: 'configure',
      fileId: 2,
      info: { rate: 8192, duration: 14592 / 8192, samples: 14592, blocks: 2, delay: 2048 },
    });
    playback.command({
      type: 'chunk',
      fileId: 2,
      chunk: {
        block: 0,
        offset: 0,
        channels: [new Float32Array(6144).fill(0.25), new Float32Array(6144).fill(0.25)],
      },
    });
    playback.command({ type: 'seek', fileId: 2, sample: 6143, revision: 1 });
    playback.command({ type: 'play', fileId: 2 });
    const out = output(2);
    playback.render(out, 8192);
    expect(Array.from(out[0])).toEqual([0.25, 0]);
    expect(playback.state()).toMatchObject({ position: 6144, waiting: true });
    playback.command({
      type: 'chunk',
      fileId: 2,
      chunk: {
        block: 1,
        offset: 6144,
        channels: [new Float32Array(8448).fill(0.5), new Float32Array(8448).fill(0.5)],
      },
    });
    playback.render(out, 8192);
    expect(Array.from(out[0])).toEqual([0.5, 0.5]);
    expect(playback.state().position).toBe(6146);
  });

  it('音量生效，新文件隔离旧消息', () => {
    const playback = setup();
    playback.command({ type: 'volume', value: 0.5 });
    playback.command({ type: 'chunk', fileId: 1, chunk: data });
    const out = output(2);
    playback.render(out, 4);
    expect(out[0][1]).toBe(0.5);
    playback.command({ type: 'configure', fileId: 2, info: short });
    playback.command({ type: 'chunk', fileId: 1, chunk: data });
    playback.command({ type: 'play', fileId: 2 });
    playback.render(out, 4);
    expect(playback.state()).toMatchObject({ position: 0, waiting: true });
  });
  it('连续跳转忽略旧版本的位置消息，取消文件后释放缓存', () => {
    const playback = setup();
    playback.command({ type: 'chunk', fileId: 1, chunk: data });
    playback.command({ type: 'seek', fileId: 1, sample: 3, revision: 2 });
    playback.command({ type: 'seek', fileId: 1, sample: 1, revision: 1 });
    expect(playback.state()).toMatchObject({ position: 3, revision: 2 });
    playback.command({ type: 'clear', fileId: 2 });
    playback.render(output(4), 4);
    expect(playback.state()).toMatchObject({
      position: 0,
      playing: false,
      waiting: false,
      fileId: 2,
    });
  });
});
