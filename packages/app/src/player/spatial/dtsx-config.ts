export const DTSX_DECODER_ASSET = "dtsx-v2";

/** mp4box exposes the unregistered dtsx sample entry as a generic payload. */
export function requireDtsx51(entry: { data?: unknown }): void {
  const bytes = entry.data;
  if (!(bytes instanceof Uint8Array) || bytes.length < 20) {
    throw new Error("DTS:X 音频轨缺少采样信息");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Version 0 AudioSampleEntry fields, followed by child boxes.
  if (view.getUint16(0) !== 0 || view.getUint16(8) !== 6 ||
      view.getUint32(16) !== 48000 * 65536) {
    throw new Error("仅支持 48 kHz 5.1 DTS:X 音源");
  }

  for (let offset = 20; offset + 8 <= view.byteLength;) {
    const size = view.getUint32(offset);
    if (size < 8 || offset + size > view.byteLength) break;
    if (view.getUint32(offset + 4) === 0x75647473 && size >= 16) { // udts
      const flags = bytes[offset + 8];
      const presentations = bytes[offset + 9] & 31;
      const mask = view.getUint32(offset + 10);
      const representation = (bytes[offset + 14] >> 2) & 7;
      if (flags === 1 && presentations === 0 && mask === 0x3f && representation === 0) return;
      throw new Error("仅支持 1024 采样／帧的 DTS-UHD Profile 2 5.1 声床");
    }
    offset += size;
  }

  throw new Error("DTS:X 音频轨缺少 udts 配置");
}
