import { describe, expect, it, vi } from "vitest";
import type { PlayerAudio } from "../src/player/deps";
import { seekPlayer } from "../src/player/seek";

function nativePlayer(paused = false) {
  const writes: number[] = [];
  let position = 133;
  const node = {
    readyState: 4, paused,
    get currentTime() { return position; },
    set currentTime(value: number) { writes.push(value); position = value; },
    pause: vi.fn(), play: vi.fn(),
  };
  const sound = { _id: 1003, _seek: 133, _ended: true, _node: node };
  const player = {
    _webAudio: false, _playLock: false, _sounds: [sound],
    state: vi.fn(() => "loaded"), seek: vi.fn(), _emit: vi.fn(),
    pause: vi.fn(), play: vi.fn(),
  };
  return { player, audio: player as unknown as PlayerAudio, sound, node, writes };
}

describe("HTML5 音频定位", () => {
  for (const paused of [true, false]) {
    it(`${paused ? "暂停" : "播放"}时只写一次媒体时间，不暂停或重启音频`, () => {
      const f = nativePlayer(paused);
      seekPlayer(f.audio, 60);
      expect(f.writes).toEqual([60]);
      expect(f.node.paused).toBe(paused);
      expect(f.player.seek).not.toHaveBeenCalled();
      expect(f.player.pause).not.toHaveBeenCalled();
      expect(f.player.play).not.toHaveBeenCalled();
      expect(f.node.pause).not.toHaveBeenCalled();
      expect(f.node.play).not.toHaveBeenCalled();
      expect(f.sound._seek).toBe(60);
      expect(f.sound._ended).toBe(false);
      expect(f.player._emit).toHaveBeenCalledWith("seek", 1003);
    });
  }

  it("play Promise 尚未完成时连续定位仍采用最后一次位置，不排队重启", () => {
    const f = nativePlayer();
    f.player._playLock = true;
    for (const position of [60, 35, 90]) seekPlayer(f.audio, position);
    expect(f.writes).toEqual([60, 35, 90]);
    expect(f.node.currentTime).toBe(90);
    expect(f.sound._seek).toBe(90);
    expect(f.player.seek).not.toHaveBeenCalled();
  });

  it("Web Audio 与软件解码播放器保留自己的定位实现", () => {
    const f = nativePlayer();
    f.player._webAudio = true;
    seekPlayer(f.audio, 25);
    expect(f.player.seek).toHaveBeenCalledWith(25);
    expect(f.writes).toEqual([]);
    const software = { seek: vi.fn() };
    seekPlayer(software as unknown as PlayerAudio, 30);
    expect(software.seek).toHaveBeenCalledWith(30);
  });

  it("原生元数据尚未加载时交由 Howler 的加载队列处理", () => {
    const f = nativePlayer();
    f.node.readyState = 0;
    seekPlayer(f.audio, 25);
    expect(f.player.seek).toHaveBeenCalledWith(25);
    expect(f.writes).toEqual([]);
  });
});
