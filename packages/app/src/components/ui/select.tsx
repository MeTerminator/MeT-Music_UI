import { Select as BaseSelect } from "@base-ui-components/react/select";

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
}

export interface SelectProps<V extends string = string> {
  value: V;
  options: readonly SelectOption<V>[];
  onValueChange: (value: V) => void;
  disabled?: boolean;
  className?: string;
}

/** 下拉选择(Base UI Select 薄封装;设置页大量使用) */
export const Select = <V extends string = string>({
  value,
  options,
  onValueChange,
  disabled,
  className = "",
}: SelectProps<V>) => (
  <BaseSelect.Root
    items={options.map((opt) => ({ value: opt.value, label: opt.label }))}
    value={value}
    onValueChange={(v) => onValueChange(v as V)}
    disabled={disabled}
  >
    <BaseSelect.Trigger
      className={`flex h-9 min-w-36 cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--met-border)] bg-[var(--met-bg-elevated)] px-3 text-sm text-[var(--met-fg)] hover:border-[var(--met-primary)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 ${className}`}
    >
      <BaseSelect.Value />
      <BaseSelect.Icon className="text-[var(--met-fg-dim)]">▾</BaseSelect.Icon>
    </BaseSelect.Trigger>
    <BaseSelect.Portal>
      <BaseSelect.Positioner sideOffset={4} className="z-50 outline-none">
        <BaseSelect.Popup className="max-h-72 overflow-auto rounded-lg border border-[var(--met-border)] bg-[var(--met-bg-elevated)] py-1 shadow-xl">
          {options.map((opt) => (
            <BaseSelect.Item
              key={opt.value}
              value={opt.value}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-[var(--met-fg)] outline-none data-[highlighted]:bg-[var(--met-bg-hover)] data-[selected]:text-[var(--met-primary)]"
            >
              <BaseSelect.ItemText>{opt.label}</BaseSelect.ItemText>
            </BaseSelect.Item>
          ))}
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  </BaseSelect.Root>
);
