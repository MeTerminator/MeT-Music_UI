# 确定性回归样本

synthetic.nac 由 LCG（seed=0x12345678，a=1664525，c=1013904223）生成三个有效编码块，每个负载字节取状态高八位，附标准 CRC-32。它是用于测试的合成编码，不是歌曲。

legacy-reference.wav 是 TypeScript 迁移前的 JS + WASM 实现输出，用于核验模型状态、索引排列、逆 FFT、重叠相加及裁剪的完整流程。包含 22784 帧，44100 Hz。它不是 QQ 音乐官方输出。

模型 SHA-256：`37238b3a0c3a47156dc2970aaad81efaf8fa0bf973f449f0d3a02a4aa8f6ed4f`。
