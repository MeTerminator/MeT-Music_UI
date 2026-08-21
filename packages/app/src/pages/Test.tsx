import { useStatusStore } from "@/stores/status";
import { useMusicStore } from "@/stores/music";
import { formatArtists } from "@/lib/format";

/**
 * 测试页面(调试用):展示当前播放曲目、播放状态与进度。
 * 原频谱调试面板随「音乐频谱」功能一并下线。
 */
const TestPage = () => {
  // 当前播放信息(调试展示)
  const playState = useStatusStore((s) => s.playState);
  const playTimeData = useStatusStore((s) => s.playTimeData);
  const playSongData = useMusicStore((s) => s.playSongData);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-[var(--met-fg)]">测试页面</h1>

      {/* 当前播放信息 */}
      <div className="rounded-xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] p-5">
        <div className="mb-3 text-sm font-semibold text-[var(--met-fg)]">当前播放</div>
        <div className="flex flex-col gap-1 text-sm text-[var(--met-fg-dim)]">
          <span>
            曲目:{playSongData?.name || "暂无"}
            {playSongData?.artists ? ` - ${formatArtists(playSongData.artists)}` : ""}
          </span>
          <span>状态:{playState ? "播放中" : "已暂停"}</span>
          <span>
            进度:{playTimeData.played} / {playTimeData.durationTime}
          </span>
        </div>
      </div>

    </div>
  );
};

export default TestPage;
