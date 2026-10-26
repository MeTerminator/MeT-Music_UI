import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { encodeWAV, parseNAC, Synthesizer, unpackCodes } from '../src/player/nac/nac';
import type { StereoChannels } from '../src/player/nac/types';

/** 每次返回独立缓冲区，避免损坏输入测试污染其他测试的原始数据。 */
async function fixture(): Promise<ArrayBuffer> {
  const data = await readFile(new URL('./fixtures/nac/synthetic.nac', import.meta.url));
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

describe('NAC 容器与编码索引', () => {
  it('读取合成样本头并校验全部编码块', async () => {
    const file = parseNAC(await fixture());
    expect(file.blocks).toBe(3);
    expect(file.samples).toBe(22784);
    expect(file.rate).toBe(44100);
    for (let block = 0; block < file.blocks; block++)
      expect(unpackCodes(file, block)).toHaveLength(1408);
  });

  it('与独立逐位提取结果一致，覆盖双声道索引转置', async () => {
    const file = parseNAC(await fixture());
    const codes = unpackCodes(file, 0);
    for (let channel = 0; channel < 2; channel++) {
      for (let time = 0; time < 32; time++) {
        for (let quantizer = 0; quantizer < 22; quantizer++) {
          const base = ((channel * 32 + time) * 22 + quantizer) * 10;
          let expected = 0;
          for (let bit = 0; bit < 10; bit++) {
            const index = base + bit;
            expected |= ((file.bytes[file.offset + (index >> 3)] >> (index & 7)) & 1) << bit;
          }
          expect(codes[channel * 704 + quantizer * 32 + time]).toBe(expected);
        }
      }
    }
  });

  it('拒绝错误文件头、版本和截断数据', async () => {
    expect(() => parseNAC(new ArrayBuffer(0))).toThrow();
    const badMagic = await fixture();
    new Uint8Array(badMagic)[0] = 0;
    expect(() => parseNAC(badMagic)).toThrow();
    const badVersion = await fixture();
    new DataView(badVersion).setFloat32(4, 2);
    expect(() => parseNAC(badVersion)).toThrow(/1.0/);
    const truncated = (await fixture()).slice(0, -1);
    expect(() => parseNAC(truncated)).toThrow();
  });

  it('拒绝负载损坏、CRC 损坏和越界索引', async () => {
    const file = parseNAC(await fixture());
    file.bytes[file.offset + 1] ^= 1;
    expect(() => unpackCodes(file, 0)).toThrow(/CRC/);
    const crc = parseNAC(await fixture());
    crc.bytes[crc.offset + 1760] ^= 1;
    expect(() => unpackCodes(crc, 0)).toThrow(/CRC/);
    expect(() => unpackCodes(crc, -1)).toThrow(/越界/);
    expect(() => unpackCodes(crc, crc.blocks)).toThrow(/越界/);
  });

  it('拒绝合法 JSON 中不受支持的模型参数', async () => {
    const source = await fixture();
    const view = new DataView(source);
    const json = new TextDecoder().decode(new Uint8Array(source, 15, view.getUint16(13)));
    const changed = json.replace('"cn":22', '"cn":21');
    new Uint8Array(source, 15, changed.length).set(new TextEncoder().encode(changed));
    expect(() => parseNAC(source)).toThrow(/参数/);
  });
});

describe('音频合成与 WAV', () => {
  it('零频谱产生零音频，裁剪后长度符合头部声明', async () => {
    const file = parseNAC(await fixture());
    const synth = new Synthesizer(file);
    for (let block = 0; block < file.blocks; block++) synth.push(new Float32Array(32768), block);
    const channels = synth.finish();
    expect(channels[0]).toHaveLength(file.samples);
    expect(channels[0].every((value) => value === 0)).toBe(true);
    expect(channels[1].every((value) => value === 0)).toBe(true);
  });

  it('拒绝无效频谱与未完成的合成', async () => {
    const synth = new Synthesizer(parseNAC(await fixture()));
    expect(() => synth.push(new Float32Array(1), 0)).toThrow(/形状/);
    expect(() => synth.finish()).toThrow(/长度/);
  });

  it('输出 IEEE float32 双声道 WAV，正确交错采样', () => {
    const channels: StereoChannels = [
      new Float32Array([0.25, 0.5]),
      new Float32Array([-0.25, -0.5]),
    ];
    const data = new DataView(encodeWAV(channels, 44100));
    expect(data.getUint16(20, true)).toBe(3);
    expect(data.getUint16(22, true)).toBe(2);
    expect(data.getUint32(24, true)).toBe(44100);
    expect(data.getUint32(40, true)).toBe(16);
    expect(data.getFloat32(48, true)).toBe(-0.25);
    expect(data.getFloat32(52, true)).toBe(0.5);
  });

  it('拒绝声道长度不一致和无效采样率', () => {
    expect(() => encodeWAV([new Float32Array(1), new Float32Array(2)], 44100)).toThrow();
    expect(() => encodeWAV([new Float32Array(1), new Float32Array(1)], 0)).toThrow();
  });
});
