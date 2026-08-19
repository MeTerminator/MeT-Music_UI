import { useCallback } from "react";
import { LyricPlayer } from "@applemusic-like-lyrics/react";
import type { LyricLineMouseEvent } from "@applemusic-like-lyrics/core";
// @ts-ignore -- css 副作用导入;项目暂缺 vite-env.d.ts(vite/client 类型),main.tsx 的 styles.css 导入同此
import "@applemusic-like-lyrics/core/style.css";
import { setSeek } from "@met/core";
import { useStatusStore } from "../../stores/status";
import { useMusicStore } from "../../stores/music";
import { useSettingsStore } from "../../stores/settings";
import { formatArtists, getCoverUrl } from "./format";

/**
 * 全屏歌词层(U2:功能完整、样式简洁)。
 * showFullPlayer 为 true 时渲染,覆盖于 PlayerBar 之上(z-40)。
 * 频谱、倒计时、纯净模式、背景流动渲染留待 U3。
 */
export default function FullPlayer() {
  const showFullPlayer = useStatusStore((s) => s.showFullPlayer);
  const coverBackground = useStatusStore((s) => s.coverBackground);
  const playState = useStatusStore((s) => s.playState);
  const playSeekMs = useStatusStore((s) => s.playSeekMs);
  const playSongData = useMusicStore((s) => s.playSongData);
  const playSongLyric = useMusicStore((s) => s.playSongLyric);
  const useAMLyrics = useSettingsStore((s) => s.useAMLyrics);
  const showYrc = useSettingsStore((s) => s.showYrc);
  const lyricsAMOffset = useSettingsStore((s) => s.lyricsAMOffset);
  const useAMSpring = useSettingsStore((s) => s.useAMSpring);
  const useAMScale = useSettingsStore((s) => s.useAMScale);
  const lyricsFontSize = useSettingsStore((s) => s.lyricsFontSize);

  const onLyricLineClick = useCallback((e: LyricLineMouseEvent) => {
    setSeek(e.line.getLine().startTime / 1000);
  }, []);

  if (!showFullPlayer) return null;

  const useYrc = useAMLyrics && playSongLyric.hasYrc && showYrc;
  const lyricLines = (useYrc ? playSongLyric.yrcAM : playSongLyric.lrcAM) ?? [];
  const hasLyric =
    (playSongLyric.yrcAM?.length ?? 0) > 0 || (playSongLyric.lrcAM?.length ?? 0) > 0;

  const coverUrl = getCoverUrl(playSongData, "l");
  const artistsText = formatArtists(playSongData.artists);

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col"
      style={{ background: coverBackground || "var(--met-bg)" }}
    >
      {/* 顶部:关闭按钮 */}
      <div className="flex shrink-0 justify-end p-4">
        <button
          type="button"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-lg"
          style={{ background: "rgba(255, 255, 255, 0.1)", color: "var(--met-fg)" }}
          title="关闭"
          onClick={() => useStatusStore.setState({ showFullPlayer: false })}
        >
          ✕
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-8 px-8 pb-8">
        {/* 左半:大封面 + 歌曲信息 */}
        <div className="flex w-1/2 flex-col items-center justify-center gap-6">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt="封面"
              className="aspect-square w-full max-w-[420px] rounded-xl object-cover shadow-2xl"
            />
          ) : (
            <div
              className="aspect-square w-full max-w-[420px] rounded-xl"
              style={{ background: "var(--met-bg-elevated)" }}
            />
          )}
          <div className="max-w-[420px] text-center">
            <div className="truncate text-xl font-bold" style={{ color: "var(--met-fg)" }}>
              {playSongData.name || "未在播放"}
            </div>
            {artistsText && (
              <div
                className="mt-1 truncate text-sm"
                style={{ color: "var(--met-fg-dim)" }}
              >
                {artistsText}
              </div>
            )}
          </div>
        </div>

        {/* 右半:AMLL 歌词 */}
        <div className="min-w-0 flex-1">
          {hasLyric ? (
            <LyricPlayer
              className="h-full w-full"
              style={{ fontSize: `${lyricsFontSize}px` }}
              lyricLines={lyricLines}
              currentTime={Math.round(playSeekMs + lyricsAMOffset)}
              playing={playState}
              enableSpring={useAMSpring}
              enableScale={useAMScale}
              onLyricLineClick={onLyricLineClick}
            />
          ) : (
            <div
              className="flex h-full items-center justify-center text-lg"
              style={{ color: "var(--met-fg-dim)" }}
            >
              暂无歌词
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
