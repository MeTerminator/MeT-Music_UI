import { useEffect, useRef, useState } from "react";
import type { RoomUser } from "@met/core";
import {
  setPlayMode,
  updateSettingsAction,
  useListenTogetherStore,
} from "@/stores/listenTogether";
import { getAssetUrl, getSessionId } from "@/platform/web";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { SettingItem, SettingSection } from "@/pages/setting/SettingItem";
import { fallbackImg, formatLogTime, type RoomLogEntry } from "./shared";

/**
 * 房间侧栏(对应旧页 .sidebar-panel):
 * 房间播放设置(所有成员均可操作,与旧页一致,无房主限制)+ 在线成员 / 房间动态标签页。
 */

const PLAY_MODE_OPTIONS = [
  { value: "normal", label: "顺序播放" },
  { value: "random", label: "随机播放" },
] as const;

/** 协议层 members 为 RoomUser[],服务端附带 userId(用于“我”标记),此处收窄 */
type MemberWithId = RoomUser & { userId?: string };

const RoomSidebar = () => {
  const roomState = useListenTogetherStore((s) => s.roomState);
  const [tab, setTab] = useState<"members" | "logs">("members");
  const logListRef = useRef<HTMLDivElement | null>(null);

  const members = roomState.members as MemberWithId[];
  const logs = roomState.logs as RoomLogEntry[];
  const selfId = getSessionId();

  // 日志更新时自动滚到底部(旧 watch logs.length)
  useEffect(() => {
    if (tab === "logs" && logListRef.current) {
      logListRef.current.scrollTop = logListRef.current.scrollHeight;
    }
  }, [logs.length, tab]);

  return (
    <div className="flex flex-col gap-5">
      {/* 房间播放设置 */}
      <SettingSection title="房间播放设置">
        <SettingItem name="播放模式" tip="列表播放顺序">
          <Select
            value={roomState.play_mode === "random" ? "random" : "normal"}
            options={PLAY_MODE_OPTIONS}
            onValueChange={(mode) => setPlayMode(mode)}
            className="min-w-32"
          />
        </SettingItem>

        <SettingItem name="播放后自动删除" tip="从队列播放后自动移出歌曲">
          <Switch
            checked={roomState.delete_after_played}
            onCheckedChange={(checked) =>
              updateSettingsAction(checked, roomState.loop_playlist)
            }
          />
        </SettingItem>

        <SettingItem name="循环播放列表" tip="播放完队列最后一首是否循环">
          <Switch
            checked={roomState.loop_playlist}
            onCheckedChange={(checked) =>
              updateSettingsAction(roomState.delete_after_played, checked)
            }
          />
        </SettingItem>
      </SettingSection>

      {/* 成员 / 动态标签页 */}
      <div className="rounded-xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)]">
        <div className="flex border-b border-[var(--met-border)]">
          {(
            [
              ["members", `在线成员 (${members.length})`],
              ["logs", "房间动态"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 cursor-pointer border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                tab === key
                  ? "border-[var(--met-primary)] text-[var(--met-primary)]"
                  : "border-transparent text-[var(--met-fg-dim)] hover:text-[var(--met-fg)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "members" ? (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto p-3">
            {members.map((member, idx) => (
              <li
                key={member.userId ?? `${member.nickname}-${idx}`}
                className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-[var(--met-bg-hover)]"
              >
                <img
                  src={member.avatar || getAssetUrl("/images/pic/avatar.jpg")}
                  alt=""
                  loading="lazy"
                  onError={fallbackImg("/images/pic/avatar.jpg")}
                  className="h-9 w-9 shrink-0 rounded-full border border-[var(--met-border)] object-cover"
                />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-sm font-bold text-[var(--met-fg)]">
                    {member.nickname}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--met-fg-dim)]">
                    {member.is_anonymous
                      ? "(匿名访问)"
                      : member.qq
                        ? `(${member.qq})`
                        : "(未绑定)"}
                  </span>
                  {member.userId === selfId && (
                    <span className="shrink-0 rounded-full bg-[var(--met-primary)]/15 px-2 py-px text-[10px] font-medium text-[var(--met-primary)]">
                      我
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div ref={logListRef} className="flex max-h-72 flex-col gap-1.5 overflow-y-auto p-3">
            {logs.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--met-fg-dim)]">
                暂无动态消息
              </p>
            ) : (
              logs.map((log, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-[var(--met-border)] bg-[var(--met-bg)] px-3 py-1.5 text-xs leading-relaxed"
                >
                  <span className="mr-2 text-[var(--met-fg-dim)]">
                    [{formatLogTime(log.timestamp)}]
                  </span>
                  <span className="mr-1.5 font-medium text-[var(--met-primary)]">
                    {log.user}
                  </span>
                  <span className="text-[var(--met-fg)]">{log.action}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomSidebar;
