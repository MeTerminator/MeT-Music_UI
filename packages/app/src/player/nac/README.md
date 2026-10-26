# QQ 音乐 NAC 解码

移植自用户提供的 `/Users/meterminator/Temp/qqmusic-nac/`：容器校验、CRC、索引解包、ONNX 推理及逆 STFT。支持对应模型的 NAC 1.0 双声道编码，不支持 QMC 外层加密。

QQ 在线音质选择 `nac` 后，请求 `/song/url/v1?platform=qq&level=nac`。需要后端支持该音质并返回可跨域读取的音频链接。浏览器先下载 NAC 文件，再由独立 Worker 逐块解码，首块 PCM 就绪后立即通过 AudioWorklet 起播，无需等待整首解码。音频线程缓存已解码块，主线程不保留第二份 PCM；暂停时后台继续解码全曲。拖动到未缓存位置时优先解码目标及后续片段，再补齐其他空洞。缓存不足时播放时钟停在缺口，数据到达后继续，歌词按实际采样位置同步。播放控制支持音量、淡入淡出、倍速、暂停与进度恢复。NAC 使用 AudioWorklet，不受普通音频的 HTML5 播放器选项影响；需要 HTTPS 或 localhost。长歌曲仍会占用全曲 PCM 内存。切歌/停止时中止下载、终止 Worker 并清空音频缓存。服务端回退常规音频时按实际格式交给 Howler 播放。

`public/nac/models/nac.onnx` 为用户提供的模型，SHA-256：`37238b3a0c3a47156dc2970aaad81efaf8fa0bf973f449f0d3a02a4aa8f6ed4f`。该模型权重归原权利人，本项目不为其重新授予许可。ONNX Runtime 的许可证保留在 `public/nac/vendor/ONNX-RUNTIME-LICENSE.txt`。

开发、构建及应用测试命令会从锁定的 `onnxruntime-web@1.23.2` 同步 JS/WASM，确保运行时版本一致。两个 ESM 运行时模块以 `.js` 文件名输出，入口和 WASM 胶水模块均显式使用该路径，兼容将 `.mjs` 当作 `application/octet-stream` 的服务器。资源遵循 Vite base `/app/`；模型和运行时按需加载，不加入 PWA 预缓存。部署时应保留 `dist/nac/`，静态服务器须以 JavaScript MIME 提供 `.js`、以 `application/wasm` 提供 `.wasm`。

测试使用确定性合成 NAC，不含真实歌曲。单元测试比较完整 PCM 与原解码器的参考 WAV；浏览器测试验证 Worker、WASM、AudioWorklet、全曲解码完成前起播、远距离跳转及暂停后台解码；核心播放器测试覆盖强制解码、格式提示、取消、错误处理和 Blob 生命周期。

生产构建浏览器回归：`pnpm --filter @met/app e2e:nac:production`。该测试通过真实页面按钮检查播放、暂停和持久化进度，并确认打包后的 Worker、Worklet、模型和 WASM 资源均能加载。
