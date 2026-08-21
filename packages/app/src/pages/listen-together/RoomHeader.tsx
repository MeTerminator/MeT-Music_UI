import { useState } from "react";
import {
  deleteRoom,
  leaveRoom,
  renewRoom,
  setAutoRenew,
  syncPlayback,
  useListenTogetherStore,
} from "@/stores/listenTogether";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog } from "@/components/ui/dialog";
import { copyText, formatRemaining } from "./shared";

/**
 * 房间页眉(对应旧页 .header-card):
 * 房间号/ID(点击复制)、剩余时间、自动续期、手动续期、隔空播放、解散/退出。
 * 与旧页一致:解散房间对所有成员可见(旧页无房主判定),二次确认后执行。
 */
const RoomHeader = () => {
  const roomState = useListenTogetherStore((s) => s.roomState);
  const remainingTime = useListenTogetherStore((s) => s.remainingTime);
  const autoRenew = useListenTogetherStore((s) => s.autoRenew);
  const renewCooldown = useListenTogetherStore((s) => s.renewCooldown);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  /** 打开隔空播放页面(旧 openAirplay) */
  const openAirplay = (): void => {
    if (roomState.uuid) window.open(`/player/?sid=${roomState.uuid}`, "_blank");
  };

  return (
    <div className="rounded-xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* 左侧:房间标识与状态 */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            title="点击复制房间号"
            onClick={() => void copyText(roomState.code, "房间号复制")}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--met-primary)]/15 px-3.5 py-1.5 text-sm font-bold text-[var(--met-primary)] transition-opacity hover:opacity-80"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--met-primary)]" />
            房间号: {roomState.code}
          </button>

          <button
            type="button"
            title="点击复制房间 ID"
            onClick={() => void copyText(roomState.uuid, "房间 UUID 复制")}
            className="inline-flex max-w-56 cursor-pointer items-center rounded-full bg-[var(--met-bg-hover)] px-3 py-1.5 text-xs text-[var(--met-fg-dim)] transition-colors hover:text-[var(--met-fg)]"
          >
            <span className="truncate">ID: {roomState.uuid}</span>
          </button>

          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${
              remainingTime < 600
                ? "bg-[var(--met-danger)]/15 text-[var(--met-danger)]"
                : "bg-[var(--met-bg-hover)] text-[var(--met-fg)]"
            }`}
          >
            剩余: {formatRemaining(remainingTime)}
          </span>
        </div>

        {/* 右侧:控制与操作按钮 */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] font-medium text-[var(--met-fg)]">
            自动续期
            <Switch checked={autoRenew} onCheckedChange={setAutoRenew} />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={renewCooldown}
              onClick={() => void renewRoom()}
            >
              {renewCooldown ? "续期冷却中" : "手动续期"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void syncPlayback()}>
              立即同步播放
            </Button>
            <Button size="sm" variant="outline" onClick={openAirplay}>
              打开隔空播放
            </Button>
            <Button size="sm" variant="danger" onClick={() => setDeleteDialogOpen(true)}>
              解散房间
            </Button>
            <Button size="sm" variant="outline" onClick={leaveRoom}>
              退出
            </Button>
          </div>
        </div>
      </div>

      {/* 解散房间二次确认(旧 handleDeleteRoom 的 $dialog.warning) */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="解散房间"
        footer={
          <>
            <Button size="sm" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setDeleteDialogOpen(false);
                deleteRoom();
              }}
            >
              确定
            </Button>
          </>
        }
      >
        确定解散当前房间吗？所有成员的连接都将被切断，此操作不可撤销！
      </Dialog>
    </div>
  );
};

export default RoomHeader;
