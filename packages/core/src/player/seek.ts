import type { PlayerAudio } from "./deps";

/** Howler 2.x 的 HTML5 单音轨内部状态，仅在此适配边界使用。 */
interface NativeHowl extends PlayerAudio {
  _webAudio: boolean;
  _sounds: Array<{
    _id: number;
    _seek: number;
    _ended: boolean;
    _node: HTMLAudioElement;
  }>;
  _emit(event: string, id: number): void;
}

/**
 * HTML5 音频直接定位，保持原生播放状态。
 * Howler.seek() 会 pause → currentTime → play → currentTime；Safari 在两次
 * 定位与重启重叠时会短暂返回旧时间，甚至让声音与媒体时钟失步。
 * 原生默认音轨的结束由 ended 事件驱动，无须重建 Howler 的播放定时器。
 */
export function seekPlayer(player: PlayerAudio, seconds: number): void {
  const howl = player as NativeHowl;
  const sound = howl._sounds?.[0];
  if (!Number.isFinite(seconds) || seconds < 0 || howl._webAudio !== false || player.state() !== "loaded" ||
      howl._sounds.length !== 1 || !sound || sound._node.readyState < 1) {
    player.seek(seconds);
    return;
  }

  // 尚在等待 play() Promise 的原生音频也可以直接定位；不再把新请求
  // 放入 Howler 的 pause/play 队列，连续点击时以最后一次定位为准。
  sound._node.currentTime = seconds;
  sound._seek = seconds;
  sound._ended = false;
  howl._emit("seek", sound._id);
}
