import { useState } from "react";
import { Slider } from "@/components/ui/slider";

/** 滑杆配合精确数值输入；输入期间保留草稿，提交时校验范围。 */
export function SettingNumber({ label, value, min, max, step = 1, unit, disabled, onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  unit?: string; disabled?: boolean; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const number = draft === null || draft.trim() === "" ? value : Number(draft);
    if (Number.isFinite(number)) onChange(Math.min(max, Math.max(min, number)));
    setDraft(null);
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Slider className="min-w-16 flex-1" ariaLabel={label} value={value} min={min} max={max} step={step} disabled={disabled} onValueChange={onChange} />
      <div className="flex items-center gap-1 text-sm text-[var(--met-fg-dim)]">
        <input type="number" aria-label={`${label}数值`} value={draft ?? value} min={min} max={max} step={step} disabled={disabled}
          onChange={(event) => setDraft(event.target.value)} onBlur={commit}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setDraft(null); } }}
          className="w-20 rounded-lg border border-[var(--met-border)] bg-[var(--met-bg)] px-2 py-1.5 text-[var(--met-fg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--met-primary)] disabled:opacity-50" />
        {unit}
      </div>
    </div>
  );
}
