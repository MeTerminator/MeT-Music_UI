import type { AudioInfo, NACFile, NACMetadata, PCMChunk, StereoChannels } from './types';

/** NAC 1.0 容器与逆 STFT。神经网络推理由 inference.ts 调用 WASM 执行。 */
const rates = [
  8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000, 88200, 96000, 176400, 192000,
];
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  return c >>> 0;
});
/** 不信任 JSON 字段类型；仅接受与已导出模型完全匹配的参数。 */
function isMetadata(value: unknown): value is NACMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    m.nf === 32 &&
    m.cn === 22 &&
    m.cb === 10 &&
    m.fft === 512 &&
    m.hop === 256 &&
    typeof m.tf === 'number' &&
    Number.isSafeInteger(m.tf) &&
    m.tf > 0 &&
    m.tf % 32 === 0 &&
    typeof m.lpf === 'number' &&
    Number.isSafeInteger(m.lpf) &&
    m.lpf >= 0 &&
    m.lpf <= 32
  );
}

/** 读取大端文件头，确认完整块数，禁止截断数据或未知尾部。 */
export function parseNAC(buffer: ArrayBuffer): NACFile {
  const bytes = new Uint8Array(buffer),
    v = new DataView(buffer);
  if (bytes.length < 15 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'NAC_')
    throw Error('不是有效的 NAC 文件');
  if (v.getFloat32(4) !== 1) throw Error('仅支持 NAC 1.0');
  const channels = bytes[8] >>> 4,
    rate = rates[bytes[8] & 15],
    samples = v.getUint32(9),
    offset = 15 + v.getUint16(13);
  if (channels !== 2 || !rate || offset > bytes.length || offset === 15)
    throw Error('不支持的声道或损坏的文件头');
  const meta: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(15, offset)),
  );
  if (!isMetadata(meta)) throw Error('NAC 参数与模型不匹配');
  const blocks = meta.tf / 32;
  if (offset + blocks * 1764 !== bytes.length || samples <= 0 || samples > blocks * 8192)
    throw Error('NAC 数据不完整或长度无效');
  return {
    bytes,
    view: v,
    meta,
    offset,
    blocks,
    samples,
    rate,
    channels,
    duration: samples / rate,
    delay: 2048 + meta.lpf * 256,
  };
}
/**
 * 先验证块 CRC，再解包低位在前的 10 位索引。
 * 磁盘顺序是 [channel,time,quantizer]，模型输入是 [channel,quantizer,time]。
 */
export function unpackCodes(file: NACFile, block: number): Int32Array<ArrayBuffer> {
  if (!Number.isInteger(block) || block < 0 || block >= file.blocks) throw Error('数据块索引越界');
  const start = file.offset + block * 1764,
    end = start + 1760;
  let crc = 0xffffffff;
  for (let p = start; p < end; p++) crc = (crc >>> 8) ^ crcTable[(crc ^ file.bytes[p]) & 255];
  if (~crc >>> 0 !== file.view.getUint32(end)) throw Error(`第 ${block + 1} 块 CRC 校验失败`);
  const result = new Int32Array(1408);
  let p = start,
    bits = 0,
    n = 0;
  for (let ch = 0; ch < 2; ch++)
    for (let t = 0; t < 32; t++)
      for (let q = 0; q < 22; q++) {
        while (n < 10) {
          bits |= file.bytes[p++] << n;
          n += 8;
        }
        result[ch * 704 + q * 32 + t] = bits & 1023;
        bits >>>= 10;
        n -= 10;
      }
  return result;
}
/** 原地 radix-2 复数逆 FFT；缩放 1/N 在加窗时统一进行。 */
function inverseFFT(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (2 * Math.PI) / size,
      wr0 = Math.cos(angle),
      wi0 = Math.sin(angle);
    for (let base = 0; base < n; base += size) {
      let wr = 1,
        wi = 0;
      for (let j = 0; j < size / 2; j++) {
        const a = base + j,
          b = a + size / 2,
          tr = wr * re[b] - wi * im[b],
          ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = wr * wr0 - wi * wi0;
        wi = wr * wi0 + wi * wr0;
        wr = next;
      }
    }
  }
}
/**
 * 持续接收模型频谱并恢复 PCM。
 * 块内使用 Hann 窗平方和归一化；相邻块另有 256 个采样点的尾部重叠。
 */
export class BlockSynthesizer {
  private readonly previous: StereoChannels;
  private readonly window: Float32Array;
  private readonly norm: Float32Array;

  constructor(private readonly file: NACFile) {
    this.previous = [new Float32Array(256), new Float32Array(256)];
    this.window = Float32Array.from(
      { length: 512 },
      (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 511),
    );
    this.norm = new Float32Array(8960);
    for (let t = 0; t < 34; t++)
      for (let k = 0; k < 512; k++) this.norm[t * 256 + k] += this.window[k] ** 2;
  }
  /** freq 布局：[channel, real/imaginary, time, frequency] = [2,2,32,256]。 */
  push(freq: Float32Array, block: number): PCMChunk {
    if (freq.length !== 32768) throw Error('模型输出形状不匹配');
    const chunks: Float32Array[] = [];
    for (let ch = 0; ch < 2; ch++) {
      const ola = new Float32Array(8960),
        re = new Float64Array(512),
        im = new Float64Array(512);
      for (let t = 0; t < 32; t++) {
        for (let k = 0; k < 256; k++) {
          re[k] = freq[ch * 16384 + t * 256 + k];
          im[k] = freq[ch * 16384 + 8192 + t * 256 + k];
        }
        // 模型未输出 Nyquist 频点；补零并构造实信号的共轭对称频谱。
        re[256] = 0;
        im[256] = 0;
        for (let k = 1; k < 256; k++) {
          re[512 - k] = re[k];
          im[512 - k] = -im[k];
        }
        inverseFFT(re, im);
        // 时间轴前后各补一帧零频谱，所以当前帧从 (t+1)*hop 开始。
        for (let k = 0; k < 512; k++) ola[(t + 1) * 256 + k] += (re[k] * this.window[k]) / 512;
      }
      const chunk = new Float32Array(8448);
      for (let i = 0; i < 8448; i++)
        chunk[i] = ola[i + 256] / Math.max(this.norm[i + 256], 1.17549435e-38);
      if (block > 0) for (let i = 0; i < 256; i++) chunk[i] += this.previous[ch][i];
      this.previous[ch].set(chunk.subarray(8192));
      chunks.push(chunk);
    }
    // 原始时间轴的块步长为 8192；首块裁掉启动延迟，末块保留 256 点尾部。
    // 全局坐标使乱序解码后的片段也能放回正确位置。
    const rawOffset = block * 8192 - this.file.delay;
    const start = Math.max(0, -rawOffset);
    const end = block === this.file.blocks - 1 ? 8448 : 8192;
    const offset = Math.max(0, rawOffset);
    const count = Math.max(0, Math.min(end - start, this.file.samples - offset));
    const output: StereoChannels = [new Float32Array(count), new Float32Array(count)];
    for (let ch = 0; ch < 2; ch++) {
      for (let i = 0; i < count; i++) {
        const sample = chunks[ch][start + i];
        if (!Number.isFinite(sample)) throw Error('模型输出无效音频');
        output[ch][i] = Math.max(-1, Math.min(1, sample));
      }
    }
    return { block, offset, channels: output };
  }
}

/** 给顺序全曲解码和数值回归保留的收集器；实时播放使用 BlockSynthesizer。 */
export class Synthesizer {
  private readonly synthesis: BlockSynthesizer;
  private readonly output: StereoChannels;
  private position = 0;

  constructor(private readonly file: NACFile) {
    this.synthesis = new BlockSynthesizer(file);
    this.output = [new Float32Array(file.samples), new Float32Array(file.samples)];
  }

  push(freq: Float32Array, block: number): void {
    const chunk = this.synthesis.push(freq, block);
    for (let ch = 0; ch < 2; ch++) this.output[ch].set(chunk.channels[ch], chunk.offset);
    this.position += chunk.channels[0].length;
  }

  finish(): StereoChannels {
    if (this.position !== this.file.samples) throw Error('解码后的音频长度不足');
    return this.output;
  }
}

/** 把有效采样坐标映射到编码块，最后一个块还包含额外的合成尾部。 */
export function blockForSample(info: AudioInfo, sample: number): number {
  return Math.min(info.blocks - 1, Math.max(0, Math.floor((sample + info.delay) / 8192)));
}

/** 将平面双声道 PCM 交错写入 IEEE float32 WAV（格式码 3）。 */
export function encodeWAV(channels: StereoChannels, rate: number): ArrayBuffer {
  if (channels[0].length !== channels[1].length || !Number.isInteger(rate) || rate <= 0)
    throw Error('无效的 PCM 参数');
  const samples = channels[0].length,
    buffer = new ArrayBuffer(44 + samples * 8),
    v = new DataView(buffer);
  const text = (p: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples * 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 3, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 8, true);
  v.setUint16(32, 8, true);
  v.setUint16(34, 32, true);
  text(36, 'data');
  v.setUint32(40, samples * 8, true);
  for (let i = 0; i < samples; i++) {
    v.setFloat32(44 + i * 8, channels[0][i], true);
    v.setFloat32(48 + i * 8, channels[1][i], true);
  }
  return buffer;
}
