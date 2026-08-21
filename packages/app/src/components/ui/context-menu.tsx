import type { ReactNode } from "react";
import {
  ContextMenu as BaseContextMenu,
  type ContextMenuTriggerProps,
} from "@base-ui-components/react/context-menu";
import { MenuItems, menuPopupClassName, type MenuItemDef } from "./menu";

export interface ContextMenuProps {
  items: readonly MenuItemDef[];
  /**
   * 触发区域渲染(Base UI render prop)。
   * 传 render={<li className="..." />} 可让列表行自身成为右键触发器;
   * 省略则渲染默认 <div>。
   */
  render?: ContextMenuTriggerProps["render"];
  className?: string;
  children?: ReactNode;
}

/** 右键菜单(Base UI ContextMenu 薄封装;弹层样式与 DropdownMenu / Select 一致) */
export const ContextMenu = ({ items, render, className, children }: ContextMenuProps) => (
  <BaseContextMenu.Root>
    <BaseContextMenu.Trigger render={render} className={className}>
      {children}
    </BaseContextMenu.Trigger>
    <BaseContextMenu.Portal>
      <BaseContextMenu.Positioner className="z-50 outline-none">
        <BaseContextMenu.Popup className={menuPopupClassName}>
          <MenuItems items={items} />
        </BaseContextMenu.Popup>
      </BaseContextMenu.Positioner>
    </BaseContextMenu.Portal>
  </BaseContextMenu.Root>
);
