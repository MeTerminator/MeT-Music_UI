import { LyricPlayer, type spring } from "@applemusic-like-lyrics/core";

/**
 * AMLL 会在切行和间奏时自动替换纵向弹簧的刚度、阻尼。
 * 完整的用户参数由 React 绑定传入（含 mass），内部节奏策略仅传部分参数；
 * 保留完整配置，使用户设置在后续切行与跳转中持续生效。
 */
export class ConfiguredLyricPlayer extends LyricPlayer {
  private userSpringY?: Partial<spring.SpringParams>;
  private resumeSyncFrame?: number;

  override setLinePosYSpringParams(params: Partial<spring.SpringParams> = {}) {
    if (params.mass !== undefined) this.userSpringY = { ...params };
    super.setLinePosYSpringParams(this.userSpringY ?? params);
  }

  override resume() {
    super.resume();
    // Web Animations 的暂停/恢复与 React effect 存在时序差异。
    // 在恢复动作之后按媒体时间重置，不能从动画自身缓存的时间续跑。
    super.setCurrentTime(this.getCurrentTime(), true);
    if (this.resumeSyncFrame !== undefined) cancelAnimationFrame(this.resumeSyncFrame);
    // WebKit 会在下一帧提交 pending play 的 startTime，再校准一次以免
    // 这次提交覆盖刚写入的 currentTime，把等待缓冲的墙上时间加回来。
    this.resumeSyncFrame = requestAnimationFrame(() => {
      this.resumeSyncFrame = undefined;
      if (this.getIsPlaying()) super.setCurrentTime(this.getCurrentTime(), true);
    });
  }

  override pause() {
    if (this.resumeSyncFrame !== undefined) cancelAnimationFrame(this.resumeSyncFrame);
    this.resumeSyncFrame = undefined;
    super.pause();
  }

  override dispose() {
    if (this.resumeSyncFrame !== undefined) cancelAnimationFrame(this.resumeSyncFrame);
    super.dispose();
  }
}
