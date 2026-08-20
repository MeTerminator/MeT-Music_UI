import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { resumeAudioContext } from "@met/core";
import { connectRoom, useListenTogetherStore } from "@/stores/listenTogether";
import { useSiteDataStore } from "@/stores/siteData";
import { getAssetUrl } from "@/platform/web";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingItem, SettingSection } from "@/pages/setting/SettingItem";
import { fallbackImg } from "./shared";

/**
 * 进房前的登录/配置面板(对应旧页 .setup-panel)。
 * 昵称与匿名开关持久化 localStorage,键名与旧页一致:
 * listen_together_nickname / listen_together_is_anonymous。
 */

const NICKNAME_KEY = "listen_together_nickname";
const ANONYMOUS_KEY = "listen_together_is_anonymous";

const inputCls =
  "h-9 rounded-lg border border-[var(--met-border)] bg-[var(--met-bg)] px-3 text-sm " +
  "text-[var(--met-fg)] outline-none placeholder:text-[var(--met-fg-dim)] " +
  "focus:border-[var(--met-primary)] disabled:cursor-not-allowed disabled:opacity-40";

const SetupPanel = () => {
  const userLoginStatus = useSiteDataStore((s) => s.userLoginStatus);
  const userData = useSiteDataStore((s) => s.userData);
  const isInRoom = useListenTogetherStore((s) => s.isInRoom);

  // 登录用户 QQ(旧 loggedInQQ)
  const loggedInQQ = userData.userId || "";

  const [nickname, setNickname] = useState(() => localStorage.getItem(NICKNAME_KEY) || "");
  const [isAnonymous, setIsAnonymous] = useState(() => {
    const saved = localStorage.getItem(ANONYMOUS_KEY);
    return saved !== null ? saved === "true" : !useSiteDataStore.getState().userLoginStatus;
  });
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  /** 已发起 WS 连接、等待 onOpen(isInRoom 翻转前的 loading 态) */
  const [connecting, setConnecting] = useState(false);
  const connectingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 头像来源(旧 userAvatar computed):匿名 > QQ > 账户 > 默认
  const profile = (userData.detail as { profile?: { nickname?: string; avatarUrl?: string } })
    ?.profile;
  const userAvatar = isAnonymous
    ? getAssetUrl("/images/pic/avatar.jpg")
    : loggedInQQ
      ? `https://q1.qlogo.cn/g?b=qq&nk=${loggedInQQ}&s=640`
      : userLoginStatus && profile?.avatarUrl
        ? profile.avatarUrl
        : getAssetUrl("/images/pic/avatar.jpg");
  const avatarTip = isAnonymous
    ? "匿名头像"
    : loggedInQQ
      ? "QQ 头像"
      : userLoginStatus
        ? "账户头像"
        : "默认头像";

  // 初次挂载:昵称为空时用登录昵称回填(旧 onMounted)
  useEffect(() => {
    if (!nickname && userLoginStatus && profile?.nickname) {
      setNickname(profile.nickname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 持久化(旧 watch)
  useEffect(() => {
    localStorage.setItem(NICKNAME_KEY, nickname);
    localStorage.setItem(ANONYMOUS_KEY, isAnonymous ? "true" : "false");
  }, [nickname, isAnonymous]);

  // 入房成功后清除 connecting;组件随 isInRoom 翻转卸载
  useEffect(() => {
    if (isInRoom) setConnecting(false);
  }, [isInRoom]);
  useEffect(
    () => () => {
      if (connectingTimer.current) clearTimeout(connectingTimer.current);
    },
    [],
  );

  /** 校验昵称(旧 handleCreateRoom / handleJoinRoom 共用逻辑) */
  const validateNickname = (): boolean => {
    if (!isAnonymous && !nickname.trim()) {
      toast.warning("请输入昵称");
      return false;
    }
    return true;
  };

  /** 发起 WS 连接并进入 connecting 态(10s 超时自动复位,失败提示由状态层负责) */
  const startConnect = (code: string): void => {
    // 用户手势中解锁音频上下文(对齐旧页 Howler.ctx.resume)
    resumeAudioContext();
    connectRoom(code, nickname, userAvatar, loggedInQQ, isAnonymous);
    setConnecting(true);
    if (connectingTimer.current) clearTimeout(connectingTimer.current);
    connectingTimer.current = setTimeout(() => setConnecting(false), 10000);
  };

  /** 创建房间(旧 handleCreateRoom;POST /api/room/create) */
  const handleCreateRoom = async (): Promise<void> => {
    if (!validateNickname()) return;
    try {
      setCreating(true);
      const response = await fetch("/api/room/create", { method: "POST" });
      // API 响应无稳定 schema,集中豁免
      const data = (await response.json()) as any;
      if (data && data.code) {
        startConnect(String(data.code));
      } else {
        toast.error("创建房间失败，服务器未返回房间号");
      }
    } catch (err) {
      console.error("创建房间出错:", err);
      toast.error("创建房间出错");
    } finally {
      setCreating(false);
    }
  };

  /** 加入房间(旧 handleJoinRoom;先 GET /api/room/check 校验) */
  const handleJoinRoom = async (): Promise<void> => {
    if (!validateNickname()) return;
    if (!joinCode || joinCode.length !== 6) {
      toast.warning("请输入6位数房间号");
      return;
    }
    try {
      setJoining(true);
      const response = await fetch(`/api/room/check?code=${joinCode}`);
      // API 响应无稳定 schema,集中豁免
      const data = (await response.json()) as any;
      if (data && data.exists) {
        startConnect(joinCode);
      } else {
        toast.error("房间不存在或已过期");
      }
    } catch (err) {
      console.error("加入房间出错:", err);
      toast.error("加入房间出错");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="flex flex-col">
      <p className="mb-2 text-sm text-[var(--met-fg-dim)]">
        与好友实时分享音乐，心动旋律，实时传递
      </p>

      {connecting && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--met-border)] bg-[var(--met-bg-elevated)] px-4 py-3 text-sm text-[var(--met-fg)]">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--met-primary)] border-t-transparent" />
          正在连接房间…
        </div>
      )}

      <SettingSection title="用户设置">
        <SettingItem name="个人头像" tip={avatarTip}>
          <img
            src={userAvatar}
            alt="头像"
            onError={fallbackImg("/images/pic/avatar.jpg")}
            className="h-12 w-12 rounded-full border border-[var(--met-border)] object-cover"
          />
        </SettingItem>

        <SettingItem name="昵称" tip="在房间中显示的昵称，匿名加入时该项被禁用">
          <input
            type="text"
            value={nickname}
            disabled={isAnonymous}
            placeholder="请输入昵称"
            onChange={(e) => setNickname(e.target.value)}
            className={`${inputCls} w-52 max-md:w-36`}
          />
        </SettingItem>

        <SettingItem name="匿名加入" tip="启用后将以“匿名”身份加入，隐藏您的昵称和头像">
          <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} />
        </SettingItem>
      </SettingSection>

      <SettingSection title="房间操作">
        <SettingItem name="加入房间" tip="请输入 6 位数字的房间号加入好友的房间">
          <div className="flex items-center gap-3">
            <input
              type="text"
              inputMode="numeric"
              value={joinCode}
              maxLength={6}
              placeholder="请输入 6 位数房间号"
              onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleJoinRoom();
              }}
              className={`${inputCls} w-44 tracking-widest`}
            />
            <Button
              variant="primary"
              disabled={joining || connecting || !joinCode || joinCode.length !== 6}
              onClick={() => void handleJoinRoom()}
            >
              {joining ? "加入中…" : "立即加入"}
            </Button>
          </div>
        </SettingItem>

        <SettingItem
          name="创建房间"
          tip="创建一个新的房间，您将成为房主并可以添加共享播放歌曲"
        >
          <Button
            variant="primary"
            disabled={creating || connecting}
            onClick={() => void handleCreateRoom()}
          >
            {creating ? "创建中…" : "创建新房间"}
          </Button>
        </SettingItem>
      </SettingSection>
    </div>
  );
};

export default SetupPanel;
