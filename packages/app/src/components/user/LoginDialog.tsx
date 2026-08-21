import { useState } from "react";
import { toast } from "sonner";
import { User } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { setUserId, setUserProfile, useSiteDataStore } from "@/stores/siteData";

export interface LoginDialogProps {
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
 * 流程与旧版一致:setUserId(qq) → await setUserProfile() → 成功「登录成功」并关闭。
 */
export default function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  const [qq, setQq] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (): Promise<void> => {
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
    setLoading(true);
    try {
      // 设置用户 QQ 号
      setUserId(value);
      // 获取用户信息(成功时由 store 置 userLoginStatus = true)
      await setUserProfile();
      if (useSiteDataStore.getState().userLoginStatus) {
        toast.success("登录成功");
        setQq("");
        onOpenChange(false);
      } else {
        // 失败提示(具体错误已由 store 内部 toast)
        toast.error("登录失败,请检查 QQ 号后重试");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="QQ号登录"
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
      <div className="relative">
        <User
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--met-fg-dim)]"
        />
        <input
          type="text"
          inputMode="numeric"
          value={qq}
          placeholder="QQ号"
          disabled={loading}
          autoFocus
          onChange={(e) => setQq(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleLogin();
          }}
          className={inputCls}
        />
      </div>
    </Dialog>
  );
}
