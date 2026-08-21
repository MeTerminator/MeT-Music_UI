import type { ReactNode } from "react";
import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  /** 底部操作区(通常放 Button) */
  footer?: ReactNode;
}

/** 模态对话框(Base UI Dialog 薄封装) */
export const Dialog = ({ open, onOpenChange, title, children, footer }: DialogProps) => (
  <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <BaseDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] p-5 text-[var(--met-fg)] shadow-2xl outline-none transition-all duration-200 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0">
        <BaseDialog.Title className="mb-3 text-base font-semibold">{title}</BaseDialog.Title>
        <div className="text-sm">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  </BaseDialog.Root>
);
