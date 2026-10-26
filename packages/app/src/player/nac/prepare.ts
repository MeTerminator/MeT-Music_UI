import { getAssetUrl } from '../../platform/web';
import { NacStreamAudio } from './stream-audio';
import type { PlayerAudio } from '@met/core';

interface PreparedAudio {
  url: string;
  format: string;
  dispose(): void;
}

/** NAC 首块解码后返回流式播放器；服务端回退音频交给 Howler。 */
export async function decodeNacUrl(
  url: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<PreparedAudio | { player: PlayerAudio; dispose(): void }> {
  signal.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`获取 NAC 音频失败：HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  signal.throwIfAborted();
  // 服务端可能回退到普通音质；按实际内容判断，不把 MP3/FLAC 送入 NAC 模型。
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)));
  let blob: Blob;
  let format = 'wav';
  if (magic === 'NAC_') {
    onProgress(0);
    const player = await NacStreamAudio.open(buffer, new URL(getAssetUrl('nac/'), location.href).href, signal, onProgress);
    return { player, dispose: () => player.unload() };
  } else {
    const ext = url.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
    const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    const formats: Record<string, string> = {
      'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
      'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
      'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm',
    };
    const bytes = new Uint8Array(buffer);
    const tag = (start: number, end: number): string => String.fromCharCode(...bytes.subarray(start, end));
    const sync = bytes.length >= 2 && bytes[0] === 0xff;
    format = magic === 'fLaC' ? 'flac' : magic === 'OggS' ? 'ogg'
      : magic === 'RIFF' && tag(8, 12) === 'WAVE' ? 'wav'
      : tag(0, 3) === 'ID3' || (sync && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 6) !== 0) ? 'mp3'
      : sync && (bytes[1] & 0xf6) === 0xf0 ? 'aac'
      : tag(4, 8) === 'ftyp' ? 'm4a'
      : (mime && formats[mime]) || (ext && /^(mp3|m4a|mp4|aac|ogg|opus|wav|flac|webm)$/.test(ext) && ext) || '';
    if (!format) throw new Error('返回的音频不是受支持的 NAC 或常规音频格式');
    const canonicalMime: Record<string, string> = {
      mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac',
      flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm',
    };
    blob = new Blob([buffer], { type: canonicalMime[format] });
  }
  onProgress(100);
  signal.throwIfAborted();
  const blobUrl = URL.createObjectURL(blob);
  return { url: blobUrl, format, dispose: () => URL.revokeObjectURL(blobUrl) };
}

