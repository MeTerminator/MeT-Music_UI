import { FLACDecoder, type FLACDecodedAudio } from "@wasm-audio-decoders/flac";
import { errorMessage, type DecodeRequest, type DecodeResponse } from "../nac/types";
import { bedLayouts, bedMix } from "./pcm-mix";
import { PcmWriter, requestPcmOutput } from "./pcm-writer";

async function decode(buffer: ArrayBuffer, fileId: number) {
  const header = new DataView(buffer);
  if (header.byteLength < 42 || header.getUint32(0) !== 0x664c6143 ||
      (header.getUint32(4) & 0x7fffffff) !== 34)
    throw new Error("FLAC 音轨缺少 STREAMINFO");

  const streamInfo = header.getBigUint64(18);
  const samples = Number(streamInfo & ((1n << 36n) - 1n));
  const channels = Number((streamInfo >> 41n) & 7n) + 1;
  const rate = Number(streamInfo >> 44n);
  if (!samples || !rate || ![1, 2, 6, 8].includes(channels))
    throw new Error("FLAC 音轨的长度或声道布局不受支持");

  const output = await requestPcmOutput(fileId, bedLayouts(channels));
  const mix = bedMix(channels, output);
  // FLAC 7.1 already has the rear pair before the side pair.
  const sourceOrder = channels === 8 ? [0, 1, 2, 3, 6, 7, 4, 5] : null;
  const decoder = new FLACDecoder();
  try {
    await decoder.ready;
    let writer: PcmWriter | undefined;
    const write = ({ channelData, samplesDecoded, sampleRate, errors }: FLACDecodedAudio) => {
      if (errors.length) throw new Error(errors[0].message);
      if (!samplesDecoded) return;
      if (sampleRate !== rate || channelData.length !== channels ||
          samplesDecoded > samples - (writer?.written ?? 0))
        throw new Error("FLAC 音轨与 STREAMINFO 不一致");
      writer ??= new PcmWriter(fileId, samples, rate, mix);
      writer.write(samplesDecoded, (frame, channel) =>
        channelData[sourceOrder?.[channel] ?? channel][frame]);
    };
    const bytes = new Uint8Array(buffer);
    const inputChunkSize = 64 * 1024;
    for (let offset = 0; offset < bytes.length; offset += inputChunkSize)
      write(await decoder.decode(bytes.subarray(offset, offset + inputChunkSize)));
    write(await decoder.flush());
    if (!writer) throw new Error("FLAC 音轨为空");
    writer.complete();
  } finally {
    decoder.free();
  }
}

self.onmessage = ({ data }: MessageEvent<DecodeRequest>) => {
  if (data.type !== "open") return;
  void decode(data.buffer, data.fileId).catch((error) =>
    self.postMessage({
      type: "error", fileId: data.fileId, message: errorMessage(error),
    } satisfies DecodeResponse),
  );
};
