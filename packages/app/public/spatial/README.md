# 预编译空间音频解码器

这些资源随仓库保存，常规 `pnpm dev` / `pnpm build` 无需重新编译。
对应 `.js` 与 `.wasm` 必须成对保留，Vite 会将本目录复制到构建产物的 `spatial/`。

构建日期：2026-11-13。工具链：Emscripten 3.1.74。
适配层：`packages/app/scripts/spatial/`，构建方法见 `docs/frontend-audio.md`。

| 资源 | 上游源码版本 | 随附文件 |
| --- | --- | --- |
| `mpegh-v2.js` / `.wasm` | Fraunhofer mpeghdec r4.0.1，`4448b69738da2fa5f2f2b0ce29eea32509e046` | `mpegh-LICENSE.txt`、`mpegh-source.tar.gz` |
| `av3a-v2.js` / `.wasm` | MOLAN-AV3A，`1564bd332205bb46afee8c643776f833020b94b6`，AVS3A_RMv3.3.1 | `av3a-LICENSE.txt`、`av3a-NOTICE.txt` |
| `dtsx-v3.js` / `.wasm` | DTSX_decoder，`5ba94ae7353ed57b04991f5dc2fdefc8865a1878` | `dtsx-LICENSE.txt` |

各解码器适用各自随附的许可文件。

更新资源后，在本目录执行以下命令更新校验值，并一起提交：

```sh
shasum -a 256 *.js *.wasm *-LICENSE.txt *-NOTICE.txt *.tar.gz > SHA256SUMS
```

校验：`shasum -a 256 -c SHA256SUMS`。
