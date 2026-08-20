import { Switch as BaseSwitch } from "@base-ui-components/react/switch";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** 开关(Base UI Switch 薄封装) */
export const Switch = ({ checked, onCheckedChange, disabled }: SwitchProps) => (
  <BaseSwitch.Root
    checked={checked}
    onCheckedChange={onCheckedChange}
    disabled={disabled}
    className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-[var(--met-border)] transition-colors data-[checked]:bg-[var(--met-primary)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
  >
    <BaseSwitch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform data-[checked]:translate-x-[22px]" />
  </BaseSwitch.Root>
);
