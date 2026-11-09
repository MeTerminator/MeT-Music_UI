import { OggVorbisDecoder, type OggVorbisDecodedAudio } from "@wasm-audio-decoders/ogg-vorbis";
import { errorMessage, type DecodeRequest, type DecodeResponse } from "../nac/types";
import { StereoPcmWriter } from "./pcm-writer";

/** QQ uses single-track Ogg streams. Read the final PCM granule without decoding twice. */
function oggSamples(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let serial: number | undefined;
  for (let offset = 0; offset + 27 <= bytes.length;) {
    if (view.getUint32(offset) !== 0x4f676753 || bytes[offset + 4] !== 0) break;
    const stream = view.getUint32(offset + 14, true);
    serial ??= stream;
    if (serial !== stream) throw new Error("暂不支持多段或多轨 Ogg 音频");
    const flags = bytes[offset + 5];
    const granule = view.getBigInt64(offset + 6, true);
    const segments = bytes[offset + 26];
    const segmentStart = offset + 27;
    const dataStart = segmentStart + segments;
    if (dataStart > bytes.length) break;
    offset = dataStart;
    for (let segment = segmentStart; segment < dataStart; segment++) offset += bytes[segment];
    if (offset > bytes.length) break;
    if ((flags & 4) && granule > 0n && granule <= BigInt(Number.MAX_SAFE_INTEGER)) {
      if (offset !== bytes.length) throw new Error("暂不支持多段 Ogg 音频");
      return Number(granule);
    }
  }
  throw new Error("Ogg 音轨缺少有效的结束页");
}

async function decode(buffer: ArrayBuffer, fileId: number) {
  const samples = oggSamples(buffer);
  const decoder = new OggVorbisDecoder();
  await decoder.ready;
  const bytes = new Uint8Array(buffer);
  let writer: StereoPcmWriter | undefined;

  const write = ({ channelData, samplesDecoded, sampleRate, errors }: OggVorbisDecodedAudio) => {
    if (errors.length) throw new Error(errors[0].message);
    if (!samplesDecoded) return;
    const count = channelData.length;
    if (count !== 12 && count !== 16)
      throw new Error(`QQ 全景声的 Vorbis 声道数不受支持（${count}）`);
    writer ??= new StereoPcmWriter(fileId, samples, sampleRate);
    if (sampleRate !== writer.rate) throw new Error("音轨中途变更采样率");

    // In the observed QQ 7.1.4 and 9.1.6 streams, PCM starts with L/R/C/LFE,
    // followed by left/right pairs. Vorbis leaves >8 channel ordering to the encoder.
    const sideGain = Math.SQRT1_2;
    const headroom = 1 + sideGain * 3 + 0.25 * (count - 8);
    const length = Math.min(samplesDecoded, samples - writer.written);
    for (let i = 0; i < length; i++) {
      const center = channelData[2][i] * sideGain;
      let left = channelData[0][i] + center;
      let right = channelData[1][i] + center;
      for (let ch = 4; ch < count; ch += 2) {
        const gain = ch < 8 ? sideGain : 0.5;
        left += channelData[ch][i] * gain;
        right += channelData[ch + 1][i] * gain;
      }
      writer.write(left / headroom, right / headroom);
    }
  };

  try {
    const inputChunkSize = 64 * 1024;
    for (let offset = 0; offset < bytes.length; offset += inputChunkSize)
      write(await decoder.decode(bytes.subarray(offset, offset + inputChunkSize)));
    write(await decoder.flush());
    if (!writer) throw new Error("Vorbis 音轨为空");
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
