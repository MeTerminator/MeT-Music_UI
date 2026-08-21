import type { ReactNode } from "react";
import { Menu as BaseMenu } from "@base-ui-components/react/menu";

/** 菜单项定义(DropdownMenu 与 ContextMenu 共用) */
export interface MenuItemDef {
  key: string;
  label: ReactNode;
  /** 危险操作(红色文案) */
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** 弹层样式(与 Select 弹层一致;context-menu.tsx 复用) */
export const menuPopupClassName =
  "min-w-40 rounded-lg border border-[var(--met-border)] bg-[var(--met-bg-elevated)] py-1 shadow-xl";

/**
 * 菜单项列表(DropdownMenu / ContextMenu 弹层内部共用)。
 * ContextMenu 的 Item 与 Menu.Item 为同一组件,可直接复用。
 */
export const MenuItems = ({ items }: { items: readonly MenuItemDef[] }) => (
  <>
    {items.map((item) => (
      <BaseMenu.Item
        key={item.key}
        disabled={item.disabled}
        onClick={item.onSelect}
        className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[highlighted]:bg-[var(--met-bg-hover)] ${
          item.danger ? "text-[var(--met-danger)]" : "text-[var(--met-fg)]"
        }`}
      >
        {item.label}
      </BaseMenu.Item>
    ))}
  </>
);

export interface DropdownMenuProps {
  items: readonly MenuItemDef[];
  /** 触发按钮内容 */
  children: ReactNode;
  disabled?: boolean;
  /** 弹层方位(默认 bottom;PlayerBar 用 top) */
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** 触发按钮样式 */
  triggerClassName?: string;
  ariaLabel?: string;
  title?: string;
}

/** 下拉菜单(Base UI Menu 薄封装;风格对齐 Select 弹层) */
export const DropdownMenu = ({
  items,
  children,
  disabled,
  side = "bottom",
  align = "end",
  triggerClassName = "",
  ariaLabel,
  title,
}: DropdownMenuProps) => (
  <BaseMenu.Root>
    <BaseMenu.Trigger
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={`cursor-pointer data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 ${triggerClassName}`}
    >
      {children}
    </BaseMenu.Trigger>
    <BaseMenu.Portal>
      <BaseMenu.Positioner side={side} align={align} sideOffset={4} className="z-50 outline-none">
        <BaseMenu.Popup className={menuPopupClassName}>
          <MenuItems items={items} />
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  </BaseMenu.Root>
);
