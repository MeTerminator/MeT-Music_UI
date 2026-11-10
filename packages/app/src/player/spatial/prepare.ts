import type { SpatialCodec } from "@met/core";
import { getAssetUrl } from "../../platform/web";
import { PcmStreamAudio } from "../nac/stream-audio";

declare const __SPATIAL_DECODERS__: Partial<Record<SpatialCodec, string>>;

export const supportedSpatialCodecs = (): SpatialCodec[] =>
  globalThis.isSecureContext &&
  typeof AudioWorkletNode !== "undefined" &&
  typeof Worker !== "undefined" &&
  typeof WebAssembly !== "undefined"
    ? [...Object.keys(__SPATIAL_DECODERS__) as SpatialCodec[], "vorbis", "flac"]
    : [];

export async function decodeSpatialUrl(
  codec: SpatialCodec,
  url: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`获取音频失败：HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const assetName = __SPATIAL_DECODERS__[codec];
  if (!assetName && codec !== "vorbis" && codec !== "flac")
    throw new Error("空间音频解码器未安装");
  const moduleUrl = assetName
    ? new URL(getAssetUrl(`spatial/${assetName}.js`), location.href).href
    : "";
  const createWorker = codec === "flac"
    ? () => new Worker(new URL("./flac-worker.ts", import.meta.url), { type: "module" })
    : codec === "vorbis"
      ? () => new Worker(new URL("./vorbis-worker.ts", import.meta.url), { type: "module" })
      : () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const player = await PcmStreamAudio.open(
    buffer, moduleUrl, signal, onProgress, createWorker,
  );
  return { player, dispose: () => player.unload() };
}
