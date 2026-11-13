# 前端音质解码

网页和 Electron renderer 使用同一套播放引擎。音质菜单根据歌曲的 `available_qualities` 和本机解码能力提供选项，切换成功后按接口返回的实际档位显示。网易云的播放元数据只列基础档位，其他已支持的档位也可选择，实际是否可用由取链结果决定，切换失败或回退时会提示。

Safari 的普通 FLAC 音源使用流式 WASM 解码与 AudioWorklet 播放，以避开原生 FLAC 跳转时实际声音与媒体时间失步的问题。读取到首批 PCM 即可起播，无须等待整首下载；后台按块继续读取和解码，跳到尚未收到的位置时暂停采样时钟与歌词动画，数据到达后继续。切歌会取消未完成的读取。带额外尾部数据的 FLAC 会校验最后一帧的采样数、CRC8 和 CRC16 后补解码，不补零或忽略损坏帧。多声道空间音源仍使用下文的输出布局选择。

AudioWorklet 播放时，歌词与进度按浏览器报告的声卡输出时间同步，而不是直接使用已经渲染到输出队列的采样位置。优先使用 `getOutputTimestamp()` 映射时间；不可用时使用 `baseLatency` 与 `outputLatency` 补偿，以适配蓝牙耳机等输出设备。倍速、缓冲与结束位置通过实际渲染记录映射，最后的采样到达输出端后才切歌。[Web Audio 输出时间戳](https://www.w3.org/TR/webaudio/#dom-audiocontext-getoutputtimestamp)

| 来源 | 档位 | 实测编码与输出 |
| --- | --- | --- |
| QQ 音乐 | 标准、较高、极高、无损、Hi-Res、臻品母带、臻品全景声 | AAC LC／HE-AAC、MP3、Vorbis、FLAC 由浏览器解码。臻品母带样本为 24-bit／192 kHz FLAC |
| QQ 音乐 | 臻品全景声 7.1.4、臻品全景声 3.0 | `Q360V3` 和 `Q360V4` 的实测 Ogg 分别包含 12 和 16 声道 Vorbis。内置 WASM 解码，可输出 12 或 16 路 PCM |
| QQ 音乐 | 360 Reality Audio | `mhm1` MP4。可选 MPEG-H WASM 按设备渲染为 7.1.4、7.1、5.1 或立体声 |
| QQ 音乐 | NAC | 原有 ONNX 解码器和 PCM 播放路径 |
| 网易云音乐 | 标准、较高、极高、无损、Hi-Res、高清臻音、超清母带 | MP3 或 FLAC 由浏览器解码。超清母带样本为 24-bit／192 kHz |
| 网易云音乐 | 沉浸环绕声 | 5.1 FLAC。内置 WASM 保留 6 路声道，跨域下载受限时交给浏览器原生播放 |
| 网易云音乐 | 臻音全景声 | `av3a` MP4。可选 AVS3 WASM 保留 7.1.4 声床 |
| QQ 音乐 | DTS:X | `dtsx` MP4，DTS-UHD Profile 2 的 48 kHz 5.1 ACE 声床。可选 WASM 解码为 6 路 PCM |
| QQ 音乐 | 杜比全景声 | 浏览器原生播放。下载页区分「杜比全景声 AC4」（`DA`）和「杜比全景声 EAC3」（`DAEAC3`，实测含 Atmos JOC）。AC-4 不可用时，播放会尝试同曲的 `DAEAC3` |
| 网易云音乐 | 杜比全景声 | 实测为 AC-4 MP4，播放档位需要浏览器报告支持 AC-4 |

软件解码在起播时根据 `AudioDestinationNode.maxChannelCount` 和实际可建立的 AudioWorklet 输出选择布局。优先使用完整声道，支持较少声道时优先保留 7.1 或 5.1，再退到立体声。缩减布局时将额外声道按左右方向混入，立体声混音省略 LFE。

当 macOS Safari 报告当前设备支持系统空间音频，或 iPhone、iPad 的浏览器支持 WAV 时，播放器优先将解码后的多声道 PCM 封装成带扬声器布局的 24-bit WAV，交由原生音频元素播放。系统可以根据当前设备渲染空间音频，即使 Web Audio 只报告两路。该路径需要完成整首解码才能起播。WAV 的 PCM 数据上限为 384 MiB，超过上限时尝试较小布局。原生播放不可用时尝试 AudioWorklet。iPhone 和 iPad 上，AudioWorklet 必须支持多声道才能继续播放同一多声道音轨，旧版双声道解码器也不会参与选档。音质菜单仍显示所选音源的档位。 [Apple 空间音频播放说明](https://developer.apple.com/videos/play/wwdc2021/10265/)

超过六路时使用离散输出。包含后置和侧置扬声器的布局按左、右、中置、LFE、后左、后右、侧左、侧右的顺序输出声床，其后的声道按源布局顺序输出。设备需要按相同顺序布线。Vorbis 规范将超过八声道的排列交由应用定义，QQ 的映射适用于实测样本。实际扬声器输出取决于浏览器、系统和硬件提供的声道。 [Web Audio 声道布局](https://www.w3.org/TR/webaudio/#ChannelLayouts) [Vorbis 声道规范](https://xiph.org/vorbis/doc/Vorbis_I_spec.html) [DTS-UHD 规范](https://www.etsi.org/deliver/etsi_ts/103400_103499/103491/01.01.01_60/ts_103491v010101p.pdf)

QQ 的软件空间音质使用 `/extra/music/url?audio_api=2` 精确取链。音源链接需允许前端跨域读取。取不到精确音质时走常规播放接口，由实际返回的档位驱动播放。软件解码先下载压缩文件，随后由 Worker 按顺序解码，首个 PCM 块到达即可起播。拖到尚未解码的位置时等待数据，切歌会停止下载或解码并清理 PCM 缓存。

QQ 杜比同样通过精确接口取流。桌面端限 Safari，iPhone 和 iPad 上根据浏览器报告的编解码能力提供档位。浏览器直接用原生音频元素播放 MP4，保留压缩音轨和 Atmos JOC 元数据。能否启用系统空间音频及头部跟踪取决于音轨和输出设备。 [Apple 杜比音频支持](https://developer.apple.com/streaming/hls-authoring-specification-for-apple-devices.html)

## 使用预编译解码器

仓库的 `packages/app/public/spatial/` 已包含 MPEG-H、AVS3 和 DTS:X 的预编译 `.js` / `.wasm`、相关许可文件及 MPEG-H 源码归档。拉取代码后直接执行 `pnpm install` 和 `pnpm build`，即可将这些资源复制到 `packages/app/dist/spatial/`，无需单独安装 CMake 或 Emscripten。

不要只保留 `.wasm`：对应的 `.js` 也是加载解码器所必需的。资源来源与版本见该目录的 `README.md`，文件校验值见 `SHA256SUMS`。NAC 运行时仍由构建脚本从锁定的 `onnxruntime-web` 依赖自动复制。

## 重新编译解码器

仅在更新解码器源码或修改 C/C++ 适配层时需要执行以下步骤，并将更新后的资源和校验值一起提交。

运行以下命令前，将 CMake 和 Emscripten 3.1.74 加入当前 shell 的 PATH。

```sh
# MPEG-H 验证版本为 Fraunhofer mpeghdec r4.0.1
bash packages/app/scripts/spatial/build.sh mpegh /path/to/mpeghdec

# AVS3 构建输入为按 UWA 条款取得的 MOLAN C API 兼容源码
bash packages/app/scripts/spatial/build.sh av3a /path/to/authorized-av3a-source

# DTS:X 验证版本为 DTSX_decoder 5ba94ae7353ed57b04991f5dc2fdefc8865a1878
bash packages/app/scripts/spatial/build.sh dtsx /path/to/DTSX_decoder

pnpm build
```

脚本将 `.js` 和 `.wasm` 写入 `packages/app/public/spatial/`。启动开发服务器和构建时会检测各解码器的资源，只有存在对应资源时才提供该档位。部署静态产物时保留 `dist/spatial/`，以 JavaScript MIME 提供 `.js`，以 `application/wasm` 提供 `.wasm`。这些文件按需加载。多声道构建使用 `mpegh-v2`、`av3a-v2` 和 `dtsx-v3`。如果只有旧版构建产物，相应档位仍可播放立体声。

MPEG-H 测试使用上游 `4448b69738da2fa5f2f2b0ce29eea32509e046`，构建脚本会附带其版权许可证，并从 Git 源码生成归档。AVS3 适配的是 `molan_av3a.h` 接口，以 AVS3A_RMv3.3.1 的 7.1.4 输入验证。解码器按各自许可提供，随仓库保留对应许可文件。[Fraunhofer 许可](https://github.com/Fraunhofer-IIS/mpeghdec/blob/r4.0.1/LICENSE.txt) [UWA 代码共享政策](https://www.theuwa.com/UWA_Code_Sharing_Policy.pdf)


DTS:X 构建需要 Python 3 和固定版本的 DTSX_decoder 源码。脚本提取其中的 ACE 解码代码，采用 ACE 的逆变换，修正 QQ 音源的频带比特分配、跨帧预测和帧解析。生成的 WASM 随附上游 PolyForm Noncommercial 许可证。[DTSX_decoder 源码](https://github.com/almirus/DTSX_decoder/tree/5ba94ae7353ed57b04991f5dc2fdefc8865a1878)

DTS:X 播放要求 `udts` 声明为单演示、48 kHz、1024 采样／帧的 5.1 声床。手动切换失败时播放器会恢复原音质，默认 DTS:X 起播失败时会请求常规音质。
