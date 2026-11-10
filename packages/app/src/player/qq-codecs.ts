import type { QQCodec } from "@met/core";
import { isAppleMobileBrowser } from "../platform/apple-mobile";

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
  const isSafari = /AppleWebKit\/[\d.]+ \(KHTML, like Gecko\) Version\/[\d.]+ (?:Mobile\/\S+ )?Safari\/[\d.]+$/.test(navigator.userAgent);
  if (isAppleMobileBrowser() || isSafari) {
    if (audio.canPlayType('audio/mp4; codecs="ec-3"')) codecs.push("eac3");
    if (audio.canPlayType('audio/mp4; codecs="ac-4"') ||
        audio.canPlayType('audio/mp4; codecs="ac-4.02.02.00"')) codecs.push("ac4");
  }
  if (
    globalThis.isSecureContext &&
    typeof AudioWorkletNode !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof WebAssembly !== "undefined"
  )
    codecs.push("nac");
  return codecs;
};
