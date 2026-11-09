import type { SpatialCodec } from "@met/core";
import { getAssetUrl } from "../../platform/web";
import { PcmStreamAudio } from "../nac/stream-audio";

declare const __SPATIAL_DECODERS__: SpatialCodec[];

export const supportedSpatialCodecs = (): SpatialCodec[] =>
  globalThis.isSecureContext &&
  typeof AudioWorkletNode !== "undefined" &&
  typeof Worker !== "undefined" &&
  typeof WebAssembly !== "undefined"
    ? [...__SPATIAL_DECODERS__, "vorbis"]
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
  const isVorbis = codec === "vorbis";
  const moduleUrl = isVorbis
    ? ""
    : new URL(getAssetUrl(`spatial/${codec}.js`), location.href).href;
  const createWorker = isVorbis
    ? () => new Worker(new URL("./vorbis-worker.ts", import.meta.url), { type: "module" })
    : () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const player = await PcmStreamAudio.open(
    buffer, moduleUrl, signal, onProgress, createWorker,
  );
  return { player, dispose: () => player.unload() };
}
