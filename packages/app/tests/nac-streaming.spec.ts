import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { DecodeQueue } from '../src/player/nac/decode-queue';
import { createDecoder } from '../src/player/nac/inference';
import { parseNAC } from '../src/player/nac/nac';
import { makeFixture } from './nac-fixture';

it('跳转优先级采用最新目标，已完成块不会重复计数，最后会补齐所有空洞', () => {
  const queue = new DecodeQueue(8);
  expect(queue.next()).toBe(0);
  queue.finish(0);
  queue.request(4);
  queue.request(6);
  expect(queue.next()).toBe(6);
  queue.finish(6);
  expect(queue.next()).toBe(7);
  queue.finish(7);
  expect(queue.next()).toBe(1);
  queue.finish(6);
  expect(queue.completed).toBe(3);
});

describe('实际 WASM 流式推理', () => {
  it('首块在全曲完成前发送；远距离跳转只预热附近块，PCM 与顺序解码一致', async () => {
    const model = new Uint8Array(
      await readFile(new URL('../public/nac/models/nac.onnx', import.meta.url)),
    );
    const decoder = await createDecoder(model, new URL('../public/nac/vendor/', import.meta.url).href);
    const buffer = await makeFixture(24);
    const file = parseNAC(buffer);
    try {
      const reference = await decoder.decode(buffer);
      const order: number[] = [];
      const progress: number[] = [];
      let pending: number | null = null;
      let maxError = 0;
      let completed = false;
      await decoder.stream(buffer, {
        onChunk(chunk) {
          expect(completed).toBe(false);
          order.push(chunk.block);
          for (let ch = 0; ch < 2; ch++)
            for (let i = 0; i < chunk.channels[ch].length; i++) {
              maxError = Math.max(
                maxError,
                Math.abs(chunk.channels[ch][i] - reference.channels[ch][chunk.offset + i]),
              );
            }
          if (order.length === 1) pending = 22 * 8192 - file.delay + 100;
        },
        onProgress(value) {
          progress.push(value);
        },
        takeSeek() {
          const sample = pending;
          pending = null;
          return sample;
        },
      });
      completed = true;
      expect(order.slice(0, 3)).toEqual([0, 22, 23]);
      expect(new Set(order).size).toBe(24);
      expect(progress).toHaveLength(24);
      expect(progress.at(-1)).toBe(1);
      expect(maxError).toBeLessThan(1e-5);
    } finally {
      await decoder.dispose();
    }
  }, 30000);

  it('取消在块边界退出，并能使用相同会话解码下一个文件', async () => {
    const model = new Uint8Array(
      await readFile(new URL('../public/nac/models/nac.onnx', import.meta.url)),
    );
    const decoder = await createDecoder(model, new URL('../public/nac/vendor/', import.meta.url).href);
    let stop = false;
    try {
      const buffer = await makeFixture(6);
      await expect(
        decoder.stream(buffer, {
          onChunk() {
            stop = true;
          },
          cancelled: () => stop,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      const next = await decoder.decode(buffer);
      expect(next.samples).toBe(6 * 8192 + 256 - 2048);
    } finally {
      await decoder.dispose();
    }
  }, 30000);
});
