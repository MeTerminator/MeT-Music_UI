import type { QQCodec } from "@met/core";

/** Probe native codecs in the actual browser; NAC uses the existing Worklet decoder. */
export const supportedQQCodecs = (): QQCodec[] => {
  if (typeof document === "undefined") return [];
  const audio = document.createElement("audio");
  const types: [QQCodec, string][] = [
    ["mp3", "audio/mpeg"],
    ["aac", 'audio/mp4; codecs="mp4a.40.2"'],
    ["flac", "audio/flac"],
    ["ogg", 'audio/ogg; codecs="vorbis"'],
  ];
  const codecs = types
    .filter(([, mime]) => !!audio.canPlayType(mime))
    .map(([codec]) => codec);
  if (
    globalThis.isSecureContext &&
    typeof AudioWorkletNode !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof WebAssembly !== "undefined"
  )
    codecs.push("nac");
  return codecs;
};
