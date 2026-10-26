import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const runtime = dirname(require.resolve('onnxruntime-web/wasm'));
const target = new URL('../public/nac/vendor/', import.meta.url);
await mkdir(target, { recursive: true });
// JS 与 WASM 使用同一锁定依赖，避免运行时 ABI 不一致。
for (const name of ['ort.wasm.min.mjs', 'ort.wasm.min.mjs.map', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  await copyFile(join(runtime, name), new URL(name, target));
}
