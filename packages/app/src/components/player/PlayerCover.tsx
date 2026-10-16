import CircularCover from "./CircularCover";
import type { Song } from "@met/core";
import { useMusicStore } from "../../stores/music";
import { useStatusStore } from "../../stores/status";
import { useSettingsStore } from "../../stores/settings";
import { getAssetUrl } from "@/platform/web";

export interface PlayerCoverProps {
  /** 根容器附加类(尺寸/响应式由父级 FullPlayer 控制) */
  className?: string;
  /** 可显式指定当前封面所属歌曲。 */
  song?: Song;
}

/**
 * 全屏播放器封面(对齐旧 PlayerCover.vue):
 *   - cover 模式:方形大封面 + 底部模糊投影,播放/暂停 scale 1↔0.9
 *     (旧 236-241 行 .cover.cover { transform: scale(0.9) } &.playing { scale(1) })
 *   - record 模式:黑胶唱片——径向渐变纹理圆盘(对照旧 CSS radial-gradient 黑白环纹),
 *     封面圆形内嵌,整盘 30s 匀速旋转,暂停 animation-play-state: paused;
 *     指针 pointer.png(public/images/pic/pointer.png),播放 -20°→0° 过渡。
 *     旧实现用 vh 定位(盘 46vh / 针 14vh / top -11.5vh / origin 1.8vh),
 *     此处换算为相对盘面的百分比(30.4% / -25% / origin 12.86%),任意尺寸下针盘对齐。
 */
export default function PlayerCover({ className = "", song }: PlayerCoverProps) {
  const playState = useStatusStore((s) => s.playState);
  const playSongData = useMusicStore((s) => s.playSongData);
  const playCoverType = useSettingsStore((s) => s.playCoverType);

  const coverSong = song ?? playSongData;
  const cover =
    coverSong.coverSize?.l || coverSong.localCover || coverSong.cover;
  const isRecord = playCoverType === "record";

  return (
    <div
      className={`relative aspect-square w-full select-none ${className}`}
      style={
        isRecord
          ? undefined
          : {
              // 旧 .cover.cover:暂停 scale(0.9),播放 scale(1),回弹曲线
              transform: playState ? "scale(1)" : "scale(0.9)",
              transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }
      }
    >
      <style>{PLAYER_COVER_CSS}</style>
      {isRecord ? (
        <>
          {/* 指针:播放时归位 0°,暂停抬起 -20°(对照旧 .pointer) */}
          <img
            src={getAssetUrl("/images/pic/pointer.png")}
            alt=""
            aria-hidden
            className="met-pcover-pointer"
            style={{ transform: playState ? "rotate(0deg)" : "rotate(-20deg)" }}
          />
          {/* 唱片盘:纹理 + 30s 匀速旋转,暂停冻结 */}
          <div
            className="met-pcover-disc"
            style={{ animationPlayState: playState ? "running" : "paused" }}
          >
            <CircularCover src={cover} className="met-pcover-disc-img" />
          </div>
        </>
      ) : (
        <>
          {/* 底部模糊投影(对照旧 .cover-shadow:top 12px, blur 20px, opacity .6, scale .95) */}
          {cover && (
            <img
              src={cover}
              alt=""
              aria-hidden
              className="absolute left-0 top-3 z-0 h-full w-full scale-95 object-cover opacity-60"
              style={{ filter: "blur(20px)" }}
            />
          )}
          <CircularCover
            src={cover}
            className="z-10 aspect-square w-full rounded-xl shadow-2xl"
          />
        </>
      )}
    </div>
  );
}

/** 黑胶纹理:黑/灰交替环(对照旧 PlayerCover.vue 的 radial-gradient #000/#555 x22) */
const RECORD_GROOVES = `radial-gradient(#000 52%, ${Array.from(
  { length: 22 },
  () => "#555, #000",
).join(", ")})`;

const PLAYER_COVER_CSS = `
@keyframes met-player-cover-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.met-pcover-disc {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1vh solid rgba(255, 255, 255, 0.19);
  background: linear-gradient(black 0%, transparent, black 98%), ${RECORD_GROOVES};
  background-clip: content-box;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 0 10px 6px rgba(0, 0, 0, 0.03);
  animation: met-player-cover-rotate 30s linear infinite;
}
.met-pcover-disc-img {
  width: 70%;
  height: 70%;
  border-radius: 50%;
  border: 1vh solid rgba(255, 255, 255, 0.25);
  object-fit: cover;
}
.met-pcover-pointer {
  position: absolute;
  width: 30.4%;
  left: 46.15%;
  top: -25%;
  transform-origin: 12.86% 12.86%;
  z-index: 20;
  transition: transform 0.3s;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}
`;
