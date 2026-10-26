import { copyFile, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const runtime = dirname(require.resolve('onnxruntime-web/wasm'));
const target = new URL('../public/nac/vendor/', import.meta.url);
await mkdir(target, { recursive: true });
// JS 与 WASM 使用同一锁定依赖；模块使用 .js，兼容未配置 .mjs MIME 的静态服务器。
for (const name of ['ort.wasm.min.mjs', 'ort.wasm.min.mjs.map', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  await copyFile(join(runtime, name), new URL(name.replace(/\.mjs$/, '.js'), target));
}
// 清除上次构建生成的 .mjs，避免继续把旧模块带入部署目录。
for (const name of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs']) {
  await rm(new URL(name, target), { force: true });
}
