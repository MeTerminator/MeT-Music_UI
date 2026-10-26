import { createDecoder } from './inference';
import { parseNAC } from './nac';
import { errorMessage } from './types';
import type { DecodeRequest, DecodeResponse } from './types';

interface DecodeWorkerScope {
  location: Location;
  onmessage: ((event: MessageEvent<DecodeRequest>) => void) | null;
  postMessage(message: DecodeResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as DecodeWorkerScope;
const reply = (message: DecodeResponse, transfer: Transferable[] = []): void =>
  scope.postMessage(message, transfer);
let assetBase = '/app/nac/';
let model: Promise<Awaited<ReturnType<typeof createDecoder>>> | null = null;
let generation = 0;
let fileId: number | null = null;
let pendingSeek: number | null = null;
let jobs: Promise<void> = Promise.resolve();

/** 页面打开就预加载模型；后续换歌复用同一会话，缩短首个音频块的等待。 */
function getDecoder(): ReturnType<typeof createDecoder> {
  if (!model) {
    const base = new URL(assetBase, scope.location.href);
    model = createDecoder(new URL('models/nac.onnx', base).href, new URL('vendor/', base).href);
    void model.catch(() => {
      model = null;
    });
  }
  return model;
}

scope.onmessage = ({ data }) => {
  if (data.type === 'prepare') {
    void getDecoder()
      .then(() => reply({ type: 'ready' }))
      .catch((error) => reply({ type: 'error', fileId: null, message: errorMessage(error) }));
    return;
  }
  if (data.type === 'seek') {
    if (data.fileId === fileId) pendingSeek = data.sample;
    return;
  }
  if (data.type === 'cancel') {
    if (data.fileId === fileId) {
      generation++;
      fileId = null;
      pendingSeek = null;
    }
    return;
  }
  assetBase = data.base;
  const current = ++generation;
  const id = data.fileId;
  fileId = id;
  pendingSeek = null;
  try {
    const { samples, rate, blocks, duration, delay } = parseNAC(data.buffer);
    reply({ type: 'info', fileId: id, info: { samples, rate, blocks, duration, delay } });
  } catch (error) {
    reply({ type: 'error', fileId: id, message: errorMessage(error) });
    return;
  }
  // 同一 ORT 会话串行使用。旧任务在块边界退出后，再开始新文件，避免状态交错。
  jobs = jobs
    .catch(() => {})
    .then(async () => {
      if (current !== generation) return;
      try {
        reply({ type: 'status', fileId: id, message: '正在准备音频…' });
        const decoder = await getDecoder();
        if (current !== generation) return;
        await decoder.stream(data.buffer, {
          onChunk(chunk) {
            reply(
              { type: 'chunk', fileId: id, chunk },
              chunk.channels.map((channel) => channel.buffer),
            );
          },
          onProgress(progress) {
            reply({ type: 'progress', fileId: id, progress });
          },
          takeSeek() {
            const sample = pendingSeek;
            pendingSeek = null;
            return sample;
          },
          cancelled: () => current !== generation,
        });
        if (current === generation) reply({ type: 'complete', fileId: id });
      } catch (error) {
        if (current === generation)
          reply({ type: 'error', fileId: id, message: errorMessage(error) });
      }
    });
};
