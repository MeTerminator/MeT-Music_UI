# 前端音质解码

网页和 Electron renderer 使用同一套播放引擎。音质菜单根据歌曲的 `available_qualities` 和本机解码能力提供选项，切换成功后按接口返回的实际档位显示。网易云的播放元数据只列基础档位，其他已支持的档位显示「音质待确认」，实际是否可用由取链结果决定，切换失败或回退时会提示。

| 来源 | 档位 | 实测编码与输出 |
| --- | --- | --- |
| QQ 音乐 | 标准、较高、极高、无损、Hi-Res、臻品母带、臻品全景声 | AAC LC／HE-AAC、MP3、Vorbis、FLAC 由浏览器解码。臻品母带样本为 24-bit／192 kHz FLAC |
| QQ 音乐 | 臻品全景声 7.1.4、臻品全景声 3.0 | `Q360V3` 和 `Q360V4` 的实测 Ogg 分别包含 12 和 16 声道 Vorbis。内置 WASM 解码后按实测声道顺序混为双声道 |
| QQ 音乐 | 360 Reality Audio | `mhm1` MP4。可选 MPEG-H WASM 以 CICP 2 双声道布局渲染 |
| QQ 音乐 | NAC | 原有 ONNX 解码器和 PCM 播放路径 |
| 网易云音乐 | 标准、较高、极高、无损、Hi-Res、高清臻音、超清母带、沉浸环绕声 | MP3 或 FLAC 由浏览器解码。超清母带样本为 24-bit／192 kHz，沉浸环绕声样本为 5.1 FLAC |
| 网易云音乐 | 臻音全景声 | `av3a` MP4。可选 AVS3 WASM 将 7.1.4 声床混为双声道 |
| QQ 音乐 | DTS:X | `dtsx` MP4，DTS-UHD Profile 2 的 48 kHz 5.1 ACE 声床。可选 WASM 解码并混为双声道 |

Vorbis 规范将超过八声道的排列交由应用定义。QQ 的双声道矩阵基于所测的两种文件布局，AVS3 走声床混音。两者的空间表现与手机播放器的渲染器有差异。浏览器及系统根据输出设备进行重采样和声道转换。[Vorbis 声道规范](https://xiph.org/vorbis/doc/Vorbis_I_spec.html) [DTS-UHD 规范](https://www.etsi.org/deliver/etsi_ts/103400_103499/103491/01.01.01_60/ts_103491v010101p.pdf)

QQ 的软件空间音质使用 `/extra/music/url?audio_api=2` 精确取链。音源链接需允许前端跨域读取。取不到精确音质时走常规播放接口，由实际返回的档位驱动播放。软件解码先下载压缩文件，随后由 Worker 按顺序解码，首个 PCM 块到达即可起播。拖到尚未解码的位置时等待数据，切歌会停止下载或解码并清理 PCM 缓存。

## 构建可选解码器

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

脚本将 `.js` 和 `.wasm` 写入 `packages/app/public/spatial/`。启动开发服务器和构建时会检测各解码器的资源，只有存在对应资源时才提供该档位。部署静态产物时保留 `dist/spatial/`，以 JavaScript MIME 提供 `.js`，以 `application/wasm` 提供 `.wasm`。这些文件按需加载。

MPEG-H 测试使用上游 `4448b69738da2fa5f2f2b0ce29eea32509e046`，构建脚本会附带其版权许可证，并从 Git 源码生成归档。AVS3 适配的是 `molan_av3a.h` 接口，以 AVS3A_RMv3.3.1 的 7.1.4 输入验证。可选解码器按各自许可提供，生成物独立于仓库源码。[Fraunhofer 许可](https://github.com/Fraunhofer-IIS/mpeghdec/blob/r4.0.1/LICENSE.txt) [UWA 代码共享政策](https://www.theuwa.com/UWA_Code_Sharing_Policy.pdf)


DTS:X 构建需要 Python 3 和固定版本的 DTSX_decoder 源码。脚本提取其中的 ACE 解码代码，采用 ACE 的逆变换，修正 QQ 音源的频带比特分配、跨帧预测和帧解析。请重新构建 `dtsx-v2.js` 和 `dtsx-v2.wasm`。新版播放器通过这两个文件检测解码能力。生成的 WASM 随附上游 PolyForm Noncommercial 许可证。[DTSX_decoder 源码](https://github.com/almirus/DTSX_decoder/tree/5ba94ae7353ed57b04991f5dc2fdefc8865a1878)

DTS:X 播放要求 `udts` 声明为单演示、48 kHz、1024 采样／帧的 5.1 声床。浏览器将 C、L/R 和 Ls/Rs 混为双声道，省略 LFE。手动切换失败时播放器会恢复原音质，默认 DTS:X 起播失败时会请求常规音质。
