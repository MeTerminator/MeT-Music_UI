import { platformName, type Platform } from "@met/core";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { User } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { loginPublicAccount } from "@/stores/siteData";

export interface LoginDialogProps {
  initialPlatform?: Platform;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const inputCls =
  "h-9 w-full rounded-lg border border-[var(--met-border)] bg-[var(--met-bg)] py-1 pr-3 pl-9 " +
  "text-sm text-[var(--met-fg)] outline-none placeholder:text-[var(--met-fg-dim)] " +
  "focus:border-[var(--met-primary)] disabled:cursor-not-allowed disabled:opacity-40";

/**
 * QQ 号登录弹窗(旧 Modal/Login.vue + Modal/LoginQQ.vue)。
 * 受控组件:open / onOpenChange 由挂载方(UserPanel)管理。
 * 请求并验证用户资料后才提交登录状态;失败时保留弹窗和输入。
 */
export default function LoginDialog({ open, onOpenChange, initialPlatform = "qq" }: LoginDialogProps) {
  const [platform, setPlatform] = useState<Platform>(initialPlatform);
  const [qq, setQq] = useState("");
  const [loading, setLoading] = useState(false);
  const loginPending = useRef(false);

  const handleLogin = async (): Promise<void> => {
    if (loginPending.current) return;
    const value = qq.trim();
    // 数字校验(旧 formRules.numberRule + LoginQQ.vue 的 parseInt 校验)
    if (value === "") {
      toast.error("请填写必要信息");
      return;
    }
    if (!/^\d+$/.test(value)) {
      toast.error("请检查你的输入");
      return;
    }
    loginPending.current = true;
    setLoading(true);
    try {
      await loginPublicAccount(value, platform);
      toast.success("登录成功");
      setQq("");
      onOpenChange(false);
    } catch {
      toast.error(`登录失败，请检查${platform === "qq" ? "QQ 号" : "网易云用户 ID"}后重试`);
    } finally {
      loginPending.current = false;
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={value => { if (!loading) onOpenChange(value); }}
      title={`${platformName(platform)}账号登录`}
      footer={
        <>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={loading}
            onClick={() => void handleLogin()}
          >
            {loading ? "登录中…" : "登录"}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex gap-2" role="group" aria-label="登录平台">
        {(["qq", "netease"] as const).map(p => <Button key={p} variant={platform === p ? "primary" : "outline"} size="sm" disabled={loading} onClick={() => { setPlatform(p); setQq(""); }}>{platformName(p)}</Button>)}
      </div>
      <div className="relative">
        <User
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--met-fg-dim)]"
        />
        <input
          type="text"
          inputMode="numeric"
          value={qq}
          placeholder={platform === "qq" ? "QQ号" : "网易云音乐用户 ID"}
          disabled={loading}
          autoFocus
          onChange={(e) => setQq(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleLogin();
          }}
          className={inputCls}
        />
      </div>
      {platform === "netease" && <p className="mt-3 text-xs text-[var(--met-fg-dim)]">在网易云个人主页链接中，id= 后的数字就是用户 ID。此处用于读取公开资料和歌单；VIP 播放需要服务器账号登录并具备对应权益。</p>}
    </Dialog>
  );
}
