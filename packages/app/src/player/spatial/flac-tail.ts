/**
 * 查找带额外尾部数据的 FLAC 最后一帧。
 * 必须同时匹配缺少的采样数、头部 CRC8 和完整帧 CRC16；不补零、不接受损坏帧。
 */
export function finalFlacFrame(tail: Uint8Array, missing: number): Uint8Array | undefined {
  for (let start = tail.length - 8; start >= 0; start--) {
    if (tail[start] !== 0xff || (tail[start + 1] & 0xfe) !== 0xf8) continue;
    const first = tail[start + 4];
    const numberBytes = first < 0x80 ? 1 : first >= 0xc0 && first < 0xe0 ? 2
      : first < 0xf0 && first >= 0xe0 ? 3 : first < 0xf8 && first >= 0xf0 ? 4
        : first < 0xfc && first >= 0xf8 ? 5 : first < 0xfe && first >= 0xfc ? 6
          : first === 0xfe ? 7 : 0;
    if (!numberBytes) continue;
    const blockCode = tail[start + 2] >> 4;
    let offset = start + 4 + numberBytes;
    const samples = blockCode === 1 ? 192 : blockCode >= 2 && blockCode <= 5 ? 576 << (blockCode - 2)
      : blockCode === 6 ? tail[offset] + 1
        : blockCode === 7 ? ((tail[offset] << 8) | tail[offset + 1]) + 1
          : blockCode >= 8 ? 256 << (blockCode - 8) : 0;
    if (samples !== missing) continue;
    offset += blockCode === 6 ? 1 : blockCode === 7 ? 2 : 0;
    const rateCode = tail[start + 2] & 15;
    if (rateCode === 15) continue;
    offset += rateCode === 12 ? 1 : rateCode === 13 || rateCode === 14 ? 2 : 0;
    if (offset >= tail.length) continue;
    let headerCrc = 0;
    for (let index = start; index <= offset; index++) {
      headerCrc ^= tail[index];
      for (let bit = 0; bit < 8; bit++) headerCrc = ((headerCrc << 1) ^ (headerCrc & 128 ? 7 : 0)) & 255;
    }
    if (headerCrc) continue;
    let frameCrc = 0;
    let frameEnd = 0;
    for (let index = start; index < tail.length; index++) {
      frameCrc ^= tail[index] << 8;
      for (let bit = 0; bit < 8; bit++) frameCrc = ((frameCrc << 1) ^ (frameCrc & 32768 ? 0x8005 : 0)) & 65535;
      if (index > offset + 3 && frameCrc === 0) frameEnd = index + 1;
    }
    if (frameEnd) return tail.subarray(start, frameEnd);
  }
}
