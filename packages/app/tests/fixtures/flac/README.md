`stereo.flac` 是本项目生成的 10 秒、44.1 kHz 双声道 440 Hz 测试音，不含歌曲内容。

重新生成：

```sh
ffmpeg -f lavfi -i 'sine=frequency=440:sample_rate=44100:duration=10' -ac 2 -c:a flac stereo.flac
```
