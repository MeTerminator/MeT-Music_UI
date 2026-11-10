import type { SpatialCodec } from "@met/core";
import { isAppleMobileBrowser } from "../../platform/apple-mobile";
import { getAssetUrl } from "../../platform/web";
import { PcmStreamAudio } from "../nac/stream-audio";
import { spatialAssets } from "./assets";
import { prepareNativeSpatialAudio, supportsNativeSpatialAudio } from "./safari";

type OptionalSpatialCodec = keyof typeof spatialAssets;
declare const __SPATIAL_DECODERS__: Partial<Record<OptionalSpatialCodec, string>>;

function spatialDecoderAsset(codec: OptionalSpatialCodec, preserveMultichannel: boolean): string | undefined {
  const asset = __SPATIAL_DECODERS__[codec];
  return !preserveMultichannel || asset === spatialAssets[codec][0] ? asset : undefined;
}

export function supportedSpatialCodecs(): SpatialCodec[] {
  if (!globalThis.isSecureContext || typeof AudioWorkletNode === "undefined" ||
      typeof Worker === "undefined" || typeof WebAssembly === "undefined") return [];
  const appleMobile = isAppleMobileBrowser();
  const optional = (Object.keys(__SPATIAL_DECODERS__) as OptionalSpatialCodec[])
    .filter((codec) => spatialDecoderAsset(codec, appleMobile));
  return [...optional, "vorbis", "flac"];
}

export async function decodeSpatialUrl(
  codec: SpatialCodec,
  url: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
) {
  const appleMobile = isAppleMobileBrowser();
  const assetName = codec === "vorbis" || codec === "flac"
    ? undefined
    : spatialDecoderAsset(codec, appleMobile);
  if (!assetName && codec !== "vorbis" && codec !== "flac")
    throw new Error("空间音频解码器未安装");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`获取音频失败：HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const moduleUrl = assetName
    ? new URL(getAssetUrl(`spatial/${assetName}.js`), location.href).href
    : "";
  const createWorker = codec === "flac"
    ? () => new Worker(new URL("./flac-worker.ts", import.meta.url), { type: "module" })
    : codec === "vorbis"
      ? () => new Worker(new URL("./vorbis-worker.ts", import.meta.url), { type: "module" })
      : () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  if (await supportsNativeSpatialAudio(appleMobile)) {
    try {
      return await prepareNativeSpatialAudio(createWorker, buffer.slice(0), moduleUrl, signal, onProgress);
    } catch {
      signal.throwIfAborted();
      onProgress(0);
    }
  }
  const player = await PcmStreamAudio.open(
    buffer, moduleUrl, signal, onProgress, createWorker, appleMobile,
  );
  return { player, dispose: () => player.unload() };
}
