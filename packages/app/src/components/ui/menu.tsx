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

/**
 * 弹层样式(DropdownMenu / ContextMenu / Select 弹层共用)。
 *
 * 进出场动画:以触发点为原点缩放淡入淡出。原点来自 Base UI 定位层写在浮层上的
 * --transform-origin(右键菜单的原点即鼠标点),所以菜单是「从触发处长出来」而不是
 * 从中心放大;该变量缺省时 transform-origin 自动回落到初始值,不会出错。
 *
 * data-[instant] 是 Base UI 标记「这次开合不该有动画」的出口(如点选菜单项后关闭),
 * 命中时把时长归零,免得点完菜单还挂着一截退场动画。
 *
 * 只列 opacity/scale 参与过渡:Tailwind v4 的 scale-* 走独立的 scale 属性,
 * 与 transform 互不干扰。
 */
export const menuPopupClassName =
  "min-w-40 origin-[var(--transform-origin)] rounded-lg border border-[var(--met-border)] bg-[var(--met-bg-elevated)] py-1 shadow-xl transition-[opacity,scale] duration-150 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[instant]:duration-0";

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
  /** 展开状态变化(全屏播放器用它在菜单打开期间保持控制条可见) */
  onOpenChange?: (open: boolean) => void;
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
  onOpenChange,
}: DropdownMenuProps) => (
  <BaseMenu.Root onOpenChange={onOpenChange}>
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
