import type { DecodeRequest, DecodeResponse } from "../nac/types";
import { nativeWaveLayout } from "./wave";

export async function supportsNativeSpatialAudio(): Promise<boolean> {
  const ua = navigator.userAgent;
  if (!/Macintosh.*Version\/[\d.]+.*Safari\//.test(ua) || !new Audio().canPlayType("audio/wav"))
    return false;
  try {
    // WebKit checks the current spatial audio route for this native multichannel codec.
    // WAV can play natively even when WebKit's codec probe does not advertise it.
    const audio = {
      contentType: 'audio/mp4; codecs="mp4a.40.2"',
      channels: "6", bitrate: 384_000, samplerate: 48_000, spatialRendering: true,
    };
    const info = await navigator.mediaCapabilities.decodingInfo({ type: "file", audio });
    const configuration = (info as MediaCapabilitiesDecodingInfo & {
      configuration?: { audio?: { spatialRendering?: boolean } };
    }).configuration;
    return info.supported && configuration?.audio?.spatialRendering === true;
  } catch {
    return false;
  }
}

export async function prepareNativeSpatialAudio(
  createWorker: () => Worker,
  buffer: ArrayBuffer,
  base: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
) {
  signal.throwIfAborted();
  const worker = createWorker();
  let abort: (() => void) | undefined;
  let blob: Blob;
  try {
    blob = await new Promise<Blob>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = ({ data }: MessageEvent<DecodeResponse>) => {
        if (data.type === "output") {
          const channels = nativeWaveLayout(data.layouts, data.samples);
          if (channels === undefined) {
            reject(new Error("原生播放器无法使用该声道布局或音轨长度"));
            return;
          }
          worker.postMessage({ type: "output", fileId: 1, channels } satisfies DecodeRequest);
        } else if (data.type === "wave") {
          resolve(data.blob);
        } else if (data.type === "progress") {
          onProgress(Math.floor(data.progress * 100));
        } else if (data.type === "error") {
          reject(new Error(data.message));
        }
      };
      worker.onerror = (event) => reject(new Error(event.message || "音频解码器加载失败"));
      worker.onmessageerror = () => reject(new Error("无法读取原生播放数据"));
      signal.throwIfAborted();
      worker.postMessage({ type: "open", fileId: 1, buffer, base, wave: true } satisfies DecodeRequest, [buffer]);
    });
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
    worker.terminate();
  }
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob);
  const dispose = () => URL.revokeObjectURL(url);
  try {
    await checkNativeMetadata(url, signal);
    return { url, format: "wav", native: true as const, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

function checkNativeMetadata(url: string, signal: AbortSignal): Promise<void> {
  const audio = new Audio();
  let timer: ReturnType<typeof setTimeout>;
  let abort: () => void;
  return new Promise<void>((resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    signal.throwIfAborted();
    timer = setTimeout(() => reject(new Error("原生音轨加载超时")), 10_000);
    audio.onloadedmetadata = () => resolve();
    audio.onerror = () => reject(new Error("原生播放器无法读取多声道 WAV"));
    audio.preload = "metadata";
    audio.src = url;
  }).finally(() => {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    audio.onloadedmetadata = audio.onerror = null;
    audio.removeAttribute("src");
    audio.load();
  });
}
