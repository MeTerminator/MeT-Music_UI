import type { ReactNode } from "react";

/** 分组容器:左侧竖条标题 + 卡片列表(对齐旧页 .set-type / n-h3 prefix="bar") */
export interface SettingSectionProps {
  title: string;
  /** 分组级附加说明(如「桌面客户端生效」) */
  note?: string;
  children: ReactNode;
}

export const SettingSection = ({ title, note, children }: SettingSectionProps) => (
  <section className="pt-8 first:pt-0">
    <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--met-fg)]">
      <span className="h-4 w-1 rounded-full bg-[var(--met-primary)]" aria-hidden />
      {title}
      {note && <span className="text-xs font-normal text-[var(--met-fg-dim)]">{note}</span>}
    </h3>
    <div className="flex flex-col gap-3">{children}</div>
  </section>
);

/** 单条设置行:卡片容器,左标题 + 说明,右控件(column 时控件换行铺满,用于 Slider) */
export interface SettingItemProps {
  name: string;
  /** 说明文案(可多段) */
  tip?: ReactNode;
  /** 「开发中」标记(对齐旧页 n-tag) */
  dev?: boolean;
  /** 控件是否独占一行(Slider 类) */
  column?: boolean;
  /** 整行置灰(仅视觉,控件自身的 disabled 需另行传入) */
  dimmed?: boolean;
  children: ReactNode;
}

export const SettingItem = ({ name, tip, dev, column, dimmed, children }: SettingItemProps) => (
  <div
    className={`rounded-lg border border-[var(--met-border)] bg-[var(--met-bg-elevated)] px-5 py-4 ${
      column ? "flex flex-col gap-3" : "flex flex-row items-center justify-between gap-5"
    } ${dimmed ? "opacity-50" : ""}`}
  >
    <div className="flex min-w-0 flex-col text-[var(--met-fg)]">
      <div className="flex flex-row items-center gap-1.5 text-base">
        {name}
        {dev && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--met-bg-hover)] px-2 py-0.5 text-xs text-[var(--met-fg-dim)]">
            开发中
          </span>
        )}
      </div>
      {tip && <div className="mt-0.5 text-xs leading-5 text-[var(--met-fg-dim)]">{tip}</div>}
    </div>
    <div className={column ? "w-full" : "shrink-0"}>{children}</div>
  </div>
);

/** Slider 行下方的刻度说明(对齐旧页 marks 的「最小 / 默认 / 最大」提示) */
export const SliderMarks = ({ marks }: { marks: string[] }) => (
  <div className="mt-1 flex justify-between text-xs text-[var(--met-fg-dim)]">
    {marks.map((m) => (
      <span key={m}>{m}</span>
    ))}
  </div>
);
