/** 最近播放(对照旧 src/views/History.vue:标题+数量、清空按钮、SongList 列表) */
import { useState } from "react";
import { setPlayHistory, useMusicStore } from "@/stores/music";
import SongList from "@/components/list/SongList";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const History = () => {
  const historyPlaylist = useMusicStore((s) => s.historyPlaylist);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {/* 标题 + 数量 */}
      <div className="mb-4 flex items-end gap-3">
        <h1 className="text-3xl font-bold text-[var(--met-fg)]">最近播放</h1>
        <span className="pb-0.5 text-base text-[var(--met-fg-dim)]">
          共 {historyPlaylist.length} 首
        </span>
      </div>

      {historyPlaylist.length > 0 ? (
        <div>
          {/* 操作区 */}
          <div className="mb-5 flex items-center gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(true)}>
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
              清空列表
            </Button>
          </div>

          {/* 列表(insert:仅播当前曲,不整表替换,对照旧 playSong 的 /history 分支) */}
          <SongList songs={historyPlaylist} showCover={false} playBehavior="insert" />

          {/* 底部提示 */}
          <div className="mt-6 flex items-center gap-3 text-xs text-[var(--met-fg-dim)]">
            <span className="h-px flex-1 border-t border-dashed border-[var(--met-border)]" />
            最多展示 500 条播放历史
            <span className="h-px flex-1 border-t border-dashed border-[var(--met-border)]" />
          </div>
        </div>
      ) : (
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-2">
          <p className="text-lg font-medium text-[var(--met-fg)]">你还没播放任何歌曲</p>
          <p className="text-sm text-[var(--met-fg-dim)]">播放过的歌曲会出现在这里</p>
        </div>
      )}

      {/* 清空二次确认 */}
      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="清空列表"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setPlayHistory(null, true);
                setConfirmOpen(false);
              }}
            >
              确认
            </Button>
          </>
        }
      >
        确认清空最近播放列表?该操作不可撤销!
      </Dialog>
    </div>
  );
};

export default History;
