import { defaultSettings, useSettingsStore, type SettingsState } from "@/stores/settings";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingItem } from "./SettingItem";
import { SettingNumber } from "./SettingNumber";

const set = useSettingsStore.setState;
const springGroups = [
  ["amllSpringY", "纵向滚动"], ["amllSpringScale", "缩放"],
] as const;
const optimizationLabels = {
  normalizeSpaces: "规范化空格", resetLineTimestamps: "根据逐字时间修正行时间",
  syncMainAndBackgroundLines: "同步主歌词与背景人声", cleanUnintentionalOverlaps: "清理意外的时间重叠",
  tryAdvanceStartTime: "提前开始歌词动画",
} as const;

export function AmllSettings({ kind }: { kind: "background" | "lyrics" }) {
  const settings = useSettingsStore();
  const number = (key: keyof SettingsState, label: string, min: number, max: number, step: number, tip: string) => (
    <SettingItem key={key} name={label} column tip={tip}>
      <SettingNumber label={label} value={settings[key] as number} min={min} max={max} step={step} onChange={(v) => set({ [key]: v })} />
    </SettingItem>
  );
  if (kind === "background") return (
    <>
      <SettingItem name="AMLL 背景渲染器" tip="选择流体背景的渲染风格">
        <Select value={settings.amllBackgroundRenderer} options={[{ label: "网格渐变", value: "mesh" }, { label: "Pixi 流体", value: "pixi" }, { label: "Isolation", value: "isolation" }]} onValueChange={(v) => set({ amllBackgroundRenderer: v })} className="w-52" />
      </SettingItem>
      {number("amllBackgroundFPS", "AMLL 背景帧率", 1, 120, 1, "每秒更新次数，默认 30；较低帧率可节省性能")}
      {number("amllBackgroundRenderScale", "AMLL 背景渲染比例", 0.1, 1, 0.05, "画布分辨率相对显示尺寸的比例，默认 0.5")}
      {number("amllBackgroundLowFreqVolume", "AMLL 背景低频强度", 0, 1, 0.05, "手动设置背景鼓点效果强度；支持该效果的渲染器生效")}
      <SettingItem name="AMLL 静态背景" tip="换歌后保持背景静止，减少动画开销">
        <Switch checked={settings.amllBackgroundStatic} onCheckedChange={(v) => set({ amllBackgroundStatic: v })} />
      </SettingItem>
      <SettingItem name="AMLL 背景响应歌词" tip="允许背景根据歌曲是否有歌词调整效果；支持该效果的渲染器生效">
        <Switch checked={settings.amllBackgroundLyricReactive} onCheckedChange={(v) => set({ amllBackgroundLyricReactive: v })} />
      </SettingItem>
      {settings.amllBackgroundRenderer === "isolation" && <>
        <SettingItem name="Isolation 明度波动"><Switch checked={settings.amllIsolationOptions.lightWave} onCheckedChange={(v) => set({ amllIsolationOptions: { ...settings.amllIsolationOptions, lightWave: v } })} /></SettingItem>
        <SettingItem name="Isolation 抖动" tip="减少渐变色带"><Switch checked={settings.amllIsolationOptions.dithering} onCheckedChange={(v) => set({ amllIsolationOptions: { ...settings.amllIsolationOptions, dithering: v } })} /></SettingItem>
        <SettingItem name="Isolation 取色算法"><Select value={settings.amllIsolationOptions.paletteAlgorithm} options={[{ label: "自动", value: "auto" }, { label: "K-Means", value: "kmeans" }, { label: "八叉树", value: "octtree" }]} onValueChange={(v) => set({ amllIsolationOptions: { ...settings.amllIsolationOptions, paletteAlgorithm: v } })} className="w-52" /></SettingItem>
      </>}
    </>
  );
  return (
    <>
      {number("amllAlignPosition", "AMLL 聚焦行位置", 0, 1, 0.01, "高亮行在歌词区域中的高度：0 顶部，0.5 居中，1 底部")}
      <SettingItem name="AMLL 聚焦行对齐锚点">
        <Select value={settings.amllAlignAnchor} options={[{ label: "行顶部", value: "top" }, { label: "行中心", value: "center" }, { label: "行底部", value: "bottom" }]} onValueChange={(v) => set({ amllAlignAnchor: v })} className="w-52" />
      </SettingItem>
      <SettingItem name="AMLL 隐藏已播放行"><Switch checked={settings.amllHidePassedLines} onCheckedChange={(v) => set({ amllHidePassedLines: v })} /></SettingItem>
      {number("amllWordFadeWidth", "AMLL 逐字渐变宽度", 0.01, 2, 0.01, "以主歌词字号为单位，默认 0.5；越小边缘越清晰")}
      {number("amllLineWidth", "AMLL 歌词行宽度", 0.3, 1, 0.01, "歌词行占歌词区域的宽度比例，默认 0.8")}
      {number("amllLinePadding", "AMLL 歌词行水平留白", 0, 4, 0.1, "以歌词字号为单位")}
      {number("amllBGLineScale", "AMLL 背景人声字号比例", 0.3, 1, 0.05, "背景人声相对主歌词的字号，默认 0.7")}
      <details className="rounded-xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] p-4">
        <summary className="cursor-pointer font-medium">AMLL 弹簧动画参数</summary>
        <div className="mt-4 flex flex-col gap-3">
          {springGroups.map(([key, title]) => (
            <div key={key} className="space-y-3">
              <div className="flex items-center justify-between"><h4 className="text-sm font-medium">{title}</h4><Button variant="ghost" onClick={() => set({ [key]: { ...defaultSettings[key] } })}>恢复默认</Button></div>
              {([ ["mass", "质量", 0.1, 10, 0.1], ["damping", "阻尼", 1, 100, 1], ["stiffness", "刚度", 1, 500, 1] ] as const).map(([field, label, min, max, step]) => (
                <SettingItem key={field} name={`${title}${label}`} column><SettingNumber label={`${title}${label}`} value={settings[key][field]} min={min} max={max} step={step} disabled={!settings.useAMSpring} onChange={(v) => set({ [key]: { ...settings[key], [field]: v } })} /></SettingItem>
              ))}
              <SettingItem name={`${title}柔和模式`}><Switch checked={settings[key].soft} disabled={!settings.useAMSpring} onCheckedChange={(v) => set({ [key]: { ...settings[key], soft: v } })} /></SettingItem>
            </div>
          ))}
        </div>
      </details>
      <details className="rounded-xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] p-4">
        <summary className="cursor-pointer font-medium">AMLL 歌词优化与文字屏蔽</summary>
        <div className="mt-4 flex flex-col gap-3">
          {Object.entries(optimizationLabels).map(([key, label]) => (
            <SettingItem key={key} name={label}><Switch checked={settings.amllOptimizeOptions[key as keyof typeof optimizationLabels] ?? true} onCheckedChange={(v) => set({ amllOptimizeOptions: { ...settings.amllOptimizeOptions, [key]: v } })} /></SettingItem>
          ))}
          <SettingItem name="不雅用语屏蔽" tip="仅处理歌词中标记为不雅用语的文字"><Select value={settings.amllMaskMode} options={[{ label: "关闭", value: "" }, { label: "全部屏蔽", value: "full-mask" }, { label: "保留首尾", value: "partial-mask" }]} onValueChange={(v) => set({ amllMaskMode: v })} className="w-52" /></SettingItem>
          <SettingItem name="屏蔽字符"><input aria-label="屏蔽字符" value={settings.amllMaskChar} maxLength={1} onChange={(e) => set({ amllMaskChar: e.target.value || "*" })} className="w-20 rounded-lg border border-[var(--met-border)] bg-[var(--met-bg)] px-3 py-2" /></SettingItem>
        </div>
      </details>
    </>
  );
}
