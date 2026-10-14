import { LyricPlayer, type spring } from "@applemusic-like-lyrics/core";

/**
 * AMLL 会在切行和间奏时自动替换纵向弹簧的刚度、阻尼。
 * 完整的用户参数由 React 绑定传入（含 mass），内部节奏策略仅传部分参数；
 * 保留完整配置，使用户设置在后续切行与跳转中持续生效。
 */
export class ConfiguredLyricPlayer extends LyricPlayer {
  private userSpringY?: Partial<spring.SpringParams>;

  override setLinePosYSpringParams(params: Partial<spring.SpringParams> = {}) {
    if (params.mass !== undefined) this.userSpringY = { ...params };
    super.setLinePosYSpringParams(this.userSpringY ?? params);
  }
}
