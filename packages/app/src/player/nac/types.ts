/** 双声道 PCM；每个声道独立连续存储。 */
export type StereoChannels = [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>];

export interface NACMetadata {
  pl?: number;
  lpf: number;
  tf: number;
  nf: 32;
  cn: 22;
  cb: 10;
  fft: 512;
  hop: 256;
}

export interface AudioInfo {
  samples: number;
  rate: number;
  blocks: number;
  duration: number;
  delay: number;
}

export interface NACFile extends AudioInfo {
  bytes: Uint8Array<ArrayBuffer>;
  view: DataView<ArrayBuffer>;
  meta: NACMetadata;
  offset: number;
  channels: 2;
}

/** offset 是有效音频中的采样位置，而不是带编码延迟的块内位置。 */
export interface PCMChunk {
  block: number;
  offset: number;
  channels: StereoChannels;
}

export interface DecodedAudio extends Omit<AudioInfo, 'delay'> {
  channels: StereoChannels;
}

/** fileId 用来隔离连续拖入多个文件时，旧任务的异步消息。 */
export type DecodeRequest =
  | { type: 'prepare' }
  | { type: 'open'; fileId: number; buffer: ArrayBuffer; base: string }
  | { type: 'seek'; fileId: number; sample: number }
  | { type: 'cancel'; fileId: number };

export type DecodeResponse =
  | { type: 'ready' }
  | { type: 'info'; fileId: number; info: AudioInfo }
  | { type: 'status'; fileId: number; message: string }
  | { type: 'chunk'; fileId: number; chunk: PCMChunk }
  | { type: 'progress'; fileId: number; progress: number }
  | { type: 'error'; fileId: number | null; message: string }
  | { type: 'complete'; fileId: number };

export interface PlaybackState {
  fileId: number;
  revision: number;
  position: number;
  playing: boolean;
  waiting: boolean;
  ended: boolean;
}

export type PlaybackCommand =
  | { type: 'dispose' }
  | { type: 'clear'; fileId: number }
  | { type: 'configure'; fileId: number; info: AudioInfo }
  | { type: 'chunk'; fileId: number; chunk: PCMChunk }
  | { type: 'seek'; fileId: number; sample: number; revision: number }
  | { type: 'play'; fileId: number }
  | { type: 'pause'; fileId: number }
  | { type: 'volume'; value: number }
  | { type: 'rate'; value: number };

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
