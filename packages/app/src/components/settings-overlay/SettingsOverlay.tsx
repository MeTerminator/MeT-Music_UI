/**
 * 全局设置悬浮层(挂载于 RootLayout 根部)。
 *
 * Base UI Dialog 的大尺寸独立壳(components/ui/dialog.tsx 面向小确认框,尺寸不合用):
 * 宽 min(92vw, 860px)、高 85vh、圆角大卡、遮罩模糊,内容区内部滚动。
 * 渲染与 /setting 路由页同一份 SettingsContent(sticky 分段导航在内部滚动容器中仍生效)。
 * 开关由 useStatusStore.showSettingsPanel 控制(不持久化)。
 */
import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";
import { X } from "lucide-react";
import { useStatusStore } from "@/stores/status";
import SettingsContent from "@/pages/setting/SettingsContent";

const SettingsOverlay = () => {
  const open = useStatusStore((s) => s.showSettingsPanel);

  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(value) => useStatusStore.setState({ showSettingsPanel: value })}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <BaseDialog.Popup className="fixed top-1/2 left-1/2 z-50 flex h-[85vh] w-[min(92vw,860px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-[var(--met-border)] bg-[var(--met-bg)] text-[var(--met-fg)] shadow-2xl outline-none">
          <BaseDialog.Title className="sr-only">全局设置</BaseDialog.Title>
          {/* 关闭按钮(悬浮于右上角,高于 sticky 分段导航) */}
          <BaseDialog.Close
            aria-label="关闭设置"
            title="关闭设置"
            className="absolute top-4 right-4 z-20 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[var(--met-bg-elevated)] text-[var(--met-fg-dim)] transition-colors hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-fg)]"
          >
            <X className="h-5 w-5" aria-hidden />
          </BaseDialog.Close>
          {/* 内部滚动容器(SettingsContent 的 sticky 导航以此为滚动祖先) */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SettingsContent />
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
};

export default SettingsOverlay;
