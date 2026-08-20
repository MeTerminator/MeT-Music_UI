import { Slider as BaseSlider } from "@base-ui-components/react/slider";

export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** 拖动过程回调 */
  onValueChange?: (value: number) => void;
  /** 拖动结束提交回调 */
  onValueCommitted?: (value: number) => void;
  className?: string;
}

/** 滑杆(Base UI Slider 薄封装;进度条/音量/设置数值共用) */
export const Slider = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  onValueChange,
  onValueCommitted,
  className = "",
}: SliderProps) => (
  <BaseSlider.Root
    value={value}
    min={min}
    max={max}
    step={step}
    disabled={disabled}
    onValueChange={(v) => onValueChange?.(v as number)}
    onValueCommitted={(v) => onValueCommitted?.(v as number)}
    className={`w-full ${className}`}
  >
    <BaseSlider.Control className="flex h-4 w-full cursor-pointer items-center py-1">
      <BaseSlider.Track className="relative h-1 w-full rounded-full bg-[var(--met-border)]">
        <BaseSlider.Indicator className="absolute h-full rounded-full bg-[var(--met-primary)]" />
        <BaseSlider.Thumb className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[var(--met-primary)] opacity-0 shadow transition-opacity group-hover:opacity-100 data-[dragging]:opacity-100" />
      </BaseSlider.Track>
    </BaseSlider.Control>
  </BaseSlider.Root>
);
