import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createDecoder } from '../src/player/nac/inference';
import { encodeWAV } from '../src/player/nac/nac';

it('WASM 完整输出与迁移前 JS 参考一致，保留流状态和裁剪行为', async () => {
  const model = await readFile(new URL('../public/nac/models/nac.onnx', import.meta.url));
  const input = await readFile(new URL('./fixtures/nac/synthetic.nac', import.meta.url));
  const reference = await readFile(new URL('./fixtures/nac/legacy-reference.wav', import.meta.url));
  // 固定参考数据对应的模型，模型变化必须重新审查基准，不能静默更新快照。
  const description = await readFile(new URL('./fixtures/nac/README.md', import.meta.url), 'utf8');
  expect(description).toContain(createHash('sha256').update(model).digest('hex'));
  const decoder = await createDecoder(
    new Uint8Array(model),
    new URL('../public/nac/vendor/', import.meta.url).href,
  );
  try {
    const progress: number[] = [];
    const buffer = input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength,
    ) as ArrayBuffer;
    const result = await decoder.decode(buffer, (value) => progress.push(value));
    expect(result.samples).toBe(22784);
    expect(progress.at(-1)).toBe(1);
    const wav = new DataView(encodeWAV(result.channels, result.rate));
    expect(wav.byteLength).toBe(reference.byteLength);
    let maxError = 0;
    for (let offset = 44; offset < wav.byteLength; offset += 4) {
      maxError = Math.max(
        maxError,
        Math.abs(wav.getFloat32(offset, true) - reference.readFloatLE(offset)),
      );
    }
    expect(maxError).toBeLessThan(1e-5);
    // 第二次解码必须从全零状态开始，不能沿用上一文件的模型缓存。
    const again = await decoder.decode(buffer);
    expect(again.channels[0]).toEqual(result.channels[0]);
  } finally {
    await decoder.dispose();
  }
}, 30000);
