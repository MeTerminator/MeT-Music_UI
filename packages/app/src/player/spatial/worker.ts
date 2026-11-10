import { createFile, MP4BoxBuffer } from "mp4box";
import { errorMessage, type DecodeRequest, type DecodeResponse } from "../nac/types";
import { spatialAssets } from "./assets";
import { requireDtsx51 } from "./dtsx-config";
import { bedLayouts, bedMix, mpegHOutputMix } from "./pcm-mix";
import { PcmWriter, requestPcmOutput } from "./pcm-writer";

interface DecoderModule {
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _spatial_init(output: number): number;
  _spatial_feed(pointer: number, size: number, timestamp: number, timescale: number): number;
  _spatial_flush(): number;
  _spatial_read(): number;
  _spatial_rate(): number;
  _spatial_channels?(): number;
  _spatial_position(): number;
  _spatial_pcm(): number;
  _spatial_close(): void;
}

function readTrack(buffer: ArrayBuffer, fourcc: string) {
  const file = createFile(false);
  file.onError = (box, message) => { throw new Error(`${box}: ${message}`); };
  file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buffer, 0), true);
  file.flush();
  // Inspect stsd directly: some AV3A files omit the optional dca3 config box.
  const track = file.moov?.traks.find((entry) =>
    entry.mdia.hdlr.handler === "soun" &&
    entry.mdia.minf.stbl.stsd.entries.some((sample) => sample.type === fourcc),
  );
  if (!track) throw new Error(`MP4 缺少 ${fourcc} 音频轨`);
  const packets = file.getTrackSamplesInfo(track.tkhd.track_id);
  if (fourcc === "dtsx") {
    const entries = track.mdia.minf.stbl.stsd.entries;
    if (entries.length !== 1) throw new Error("暂不支持多种 DTS:X 采样描述");
    requireDtsx51(entries[0]);
  }
  const edits = track.edts?.elst?.entries ?? [];
  const edit = edits[0];
  if (edits.length > 1 || (edit && (
    edit.media_time < 0 || edit.media_rate_integer !== 1 || edit.media_rate_fraction !== 0
  ))) throw new Error("暂不支持该 MP4 的剪辑列表");

  const timescale = track.mdia.mdhd.timescale;
  const start = (edit?.media_time ?? 0) / timescale;
  const last = packets.at(-1);
  if (!last || !timescale) throw new Error("MP4 音频轨为空");
  const available = (last.cts + last.duration) / timescale - start;
  const duration = edit
    ? Math.min(available, edit.segment_duration / file.moov.mvhd.timescale)
    : available;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("MP4 音频时长无效");
  return { packets, start, duration, timescale };
}

async function decode({ buffer, base, fileId, wave }: Extract<DecodeRequest, { type: "open" }>) {
  const moduleName = new URL(base).pathname.split("/").at(-1);
  const matches = (names: readonly string[]) => names.some((name) => `${name}.js` === moduleName);
  const fourcc = matches(spatialAssets.mpegh) ? "mhm1"
    : matches(spatialAssets.av3a) ? "av3a"
    : matches(spatialAssets.dtsx) ? "dtsx" : undefined;
  if (!fourcc) throw new Error("未知的空间音频解码器");
  const { packets, start, duration, timescale } = readTrack(buffer, fourcc);
  const { default: createDecoder } = await import(/* @vite-ignore */ base) as {
    default(options: { locateFile: (name: string) => string }): Promise<DecoderModule>;
  };
  const decoder = await createDecoder({ locateFile: (name) => new URL(name, base).href });
  const bytes = new Uint8Array(buffer);
  let writer: PcmWriter | undefined;

  async function decodePackets(renderChannels?: number) {
    if (decoder._spatial_init(renderChannels ?? 2) !== 0) throw new Error("音频解码器初始化失败");
    let input = 0;
    let capacity = 0;
    let sourceChannels = 0;

    async function drain() {
      for (;;) {
        const frames = decoder._spatial_read();
        if (frames < 0) throw new Error("解码器返回了无效的 PCM 帧");
        if (frames === 0) return;
        const rate = decoder._spatial_rate();
        const channels = decoder._spatial_channels?.() ?? 2;
        if (!writer) {
          if (fourcc === "av3a" && channels > 12)
            throw new Error("AVS3 音轨的声道布局不受支持");
          const samples = Math.round(duration * rate);
          const output = renderChannels ?? await requestPcmOutput(fileId, bedLayouts(channels), samples);
          if (renderChannels !== undefined && channels !== renderChannels)
            throw new Error("MPEG-H 渲染布局与输出布局不一致");
          const mix = renderChannels === undefined ? bedMix(channels, output) : mpegHOutputMix(output);
          writer = new PcmWriter(fileId, samples, rate, mix, wave);
          sourceChannels = channels;
        }
        if (rate !== writer.rate || channels !== sourceChannels)
          throw new Error("音轨中途变更采样率或声道布局");

        const frameStart = Math.round(decoder._spatial_position() - start * rate);
        const end = Math.min(writer.samples, frameStart + frames);
        if (end <= writer.written) continue;
        if (frameStart > writer.written)
          throw new Error(`音轨采样不连续（${writer.written} → ${frameStart}）`);
        const pcmStart = decoder._spatial_pcm() / Float32Array.BYTES_PER_ELEMENT;
        const pcm = decoder.HEAPF32;
        const first = pcmStart + channels * (writer.written - frameStart);
        writer.write(end - writer.written, (frame, channel) => pcm[first + frame * channels + channel]);
      }
    }

    try {
      for (const packet of packets) {
        if (!packet.description || !("type" in packet.description) ||
            packet.description.type !== fourcc || packet.size <= 0 ||
            packet.offset < 0 || packet.offset + packet.size > bytes.length) {
          throw new Error("MP4 音频包不完整");
        }
        if (packet.size > capacity) {
          decoder._free(input);
          input = decoder._malloc(packet.size);
          if (!input) throw new Error("音频解码器内存不足");
          capacity = packet.size;
        }
        decoder.HEAPU8.set(bytes.subarray(packet.offset, packet.offset + packet.size), input);
        if (decoder._spatial_feed(input, packet.size, packet.cts, timescale) !== 0)
          throw new Error("无法解码 MP4 音频包");
        await drain();
      }
      if (decoder._spatial_flush() !== 0) throw new Error("无法输出末尾 PCM 帧");
      await drain();
      if (!writer) throw new Error("MP4 音轨为空");
      writer.complete();
    } finally {
      decoder._free(input);
      decoder._spatial_close();
    }
  }

  if (fourcc === "mhm1" && decoder._spatial_channels) {
    const samples = Math.round(duration * 48_000);
    const output = await requestPcmOutput(fileId, [12, 8, 6, 2], samples);
    try {
      await decodePackets(output);
    } catch (error) {
      if (writer || output === 2) throw error;
      // A presentation may lack a render for the device's layout.
      await decodePackets(await requestPcmOutput(fileId, [2], samples));
    }
  } else {
    await decodePackets();
  }
}

self.onmessage = ({ data }: MessageEvent<DecodeRequest>) => {
  if (data.type !== "open") return;
  void decode(data).catch((error) =>
    self.postMessage({
      type: "error", fileId: data.fileId, message: errorMessage(error),
    } satisfies DecodeResponse),
  );
};
