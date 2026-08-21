import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "icon";

const variantCls: Record<Variant, string> = {
  primary:
    "bg-[var(--met-primary)] text-[var(--met-primary-fg)] hover:opacity-90 disabled:opacity-40",
  ghost:
    "bg-transparent text-[var(--met-fg)] hover:bg-[var(--met-bg-hover)] disabled:opacity-40",
  outline:
    "border border-[var(--met-border)] text-[var(--met-fg)] hover:bg-[var(--met-bg-hover)] disabled:opacity-40",
  danger: "bg-[var(--met-danger)] text-white hover:opacity-90 disabled:opacity-40",
};

const sizeCls: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  icon: "h-9 w-9 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** 通用按钮(圆角胶囊,与旧 UI 的 n-button 风格对齐) */
export const Button = ({
  variant = "ghost",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) => (
  <button
    type={type}
    className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:cursor-not-allowed ${variantCls[variant]} ${sizeCls[size]} ${className}`}
    {...props}
  />
);
