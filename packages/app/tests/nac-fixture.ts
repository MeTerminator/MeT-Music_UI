import { readFile } from 'node:fs/promises';

/** 重复已有 CRC 正确的合成编码块，构造足够长的流；不包含真实歌曲。 */
export async function makeFixture(blocks: number): Promise<ArrayBuffer> {
  const source = await readFile(new URL('./fixtures/nac/synthetic.nac', import.meta.url));
  const sourceOffset = 15 + source.readUInt16BE(13);
  const samples = blocks * 8192 + 256 - 2048;
  const meta = new TextEncoder().encode(
    JSON.stringify({
      pl: samples,
      lpf: 0,
      tf: blocks * 32,
      nf: 32,
      cn: 22,
      cb: 10,
      fft: 512,
      hop: 256,
    }),
  );
  const offset = 15 + meta.length;
  const buffer = new ArrayBuffer(offset + blocks * 1764);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  bytes.set(new TextEncoder().encode('NAC_'));
  view.setFloat32(4, 1);
  bytes[8] = 0x27;
  view.setUint32(9, samples);
  view.setUint16(13, meta.length);
  bytes.set(meta, 15);
  for (let block = 0; block < blocks; block++) {
    const start = sourceOffset + (block % 3) * 1764;
    bytes.set(source.subarray(start, start + 1764), offset + block * 1764);
  }
  return buffer;
}
