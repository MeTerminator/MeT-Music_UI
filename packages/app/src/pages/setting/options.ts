/**
 * 全局设置页的选项数据(文案照抄旧 src/views/Setting/index.vue)。
 */
import type { SelectOption } from "@/components/ui/select";

/** Only formats supported by this browser or the existing NAC decoder. */
import { qqPlaybackQualities } from "@met/core";
import { supportedQQCodecs } from "@/player/qq-codecs";

export const songLevelData: Record<
  string,
  { label: string; tip: string; value: string }
> = Object.fromEntries(
  qqPlaybackQualities(supportedQQCodecs()).map((q) => [
    q.key.toLowerCase(),
    {
      label: q.label,
      value: q.key.toLowerCase(),
      tip:
        q.codec === "nac"
          ? "使用本机 NAC 解码器播放"
          : "缺少所选音质时回退到当前浏览器支持的音频；实际规格以音源为准",
    },
  ]),
);
export const songLevelOptions: SelectOption[] = Object.values(
  songLevelData,
).map(({ label, value }) => ({ label, value }));

export const neteaseSongLevelData: Record<
  string,
  { label: string; tip: string }
> = {
  standard: { label: "标准", tip: "标准音质" },
  higher: { label: "较高", tip: "较高音质" },
  exhigh: { label: "极高", tip: "极高音质" },
  lossless: { label: "无损", tip: "无损音质" },
  hires: { label: "Hi-Res", tip: "高解析度音质" },
  jyeffect: { label: "高清臻音", tip: "高清臻音" },
  dolby: { label: "杜比全景声", tip: "需要设备支持杜比全景声" },
  vivid: { label: "臻音全景声", tip: "臻音全景声" },
  jymaster: { label: "超清母带", tip: "超清母带音质" },
  sky: { label: "沉浸环绕声", tip: "沉浸环绕声，默认使用 c51 类型" },
};
export const neteaseSongLevelOptions: SelectOption[] = Object.entries(
  neteaseSongLevelData,
).map(([value, { label }]) => ({ label, value }));

/** 主题数据 */
export const themeColorOptions: SelectOption[] = [
  { label: "欢快派对", value: "red" },
  { label: "柑橘桔梦", value: "orange" },
  { label: "深海蓝梦", value: "blue" },
  { label: "粉色梦幻", value: "pink" },
  { label: "深棕林荫", value: "brown" },
  { label: "星空靛蓝", value: "indigo" },
  { label: "生命绿洲", value: "green" },
  { label: "皇室紫梦", value: "purple" },
  { label: "金色阳光", value: "yellow" },
  { label: "海洋碧绿", value: "teal" },
];

/** 字体选项(页面字体与歌词字体共用) */
export const fontOptions: SelectOption[] = [
  { label: "HarmonyOS Regular", value: "harmony_reg" },
  { label: "HarmonyOS Bold", value: "harmony_bold" },
  { label: "PingFangSC Regular", value: "pingfang_reg" },
  { label: "PingFangSC Semibold", value: "pingfang_semi" },
  { label: "系统默认", value: "system" },
];

/**
 * 歌词字重。0 = 跟随所选歌词字体自带的字重(HarmonyOS Bold 为 bold、
 * Regular 为 normal……),保持不设置时的原有观感;其余为 CSS font-weight 数值。
 */
export const lyricFontWeightOptions: SelectOption[] = [
  { label: "跟随字体", value: "0" },
  { label: "100 纤细", value: "100" },
  { label: "200 特细", value: "200" },
  { label: "300 细体", value: "300" },
  { label: "400 常规", value: "400" },
  { label: "500 中等", value: "500" },
  { label: "600 半粗", value: "600" },
  { label: "700 粗体", value: "700" },
  { label: "800 特粗", value: "800" },
  { label: "900 黑体", value: "900" },
];

/** 明暗模式 */
export const themeTypeOptions: SelectOption<"light" | "dark">[] = [
  { label: "浅色模式", value: "light" },
  { label: "深色模式", value: "dark" },
];

/** 全局动态取色类别 */
export const themeAutoCoverTypeOptions: SelectOption[] = [
  { label: "中性", value: "neutral" },
  { label: "中性变体", value: "neutralVariant" },
  { label: "主要", value: "primary" },
  { label: "次要", value: "secondary" },
  { label: "次次要", value: "tertiary" },
];

/** 播放器样式 */
export const playCoverTypeOptions: SelectOption[] = [
  { label: "封面模式", value: "cover" },
  { label: "唱片模式", value: "record" },
];

/** 播放背景样式 */
export const playerBackgroundTypeOptions: SelectOption[] = [
  { label: "流体效果", value: "animation" },
  { label: "封面模糊", value: "blur" },
  { label: "主色渐变", value: "gradient" },
  { label: "AMLL 流体效果", value: "amllAnimation" },
];

/** 歌词位置 */
export const lyricsPositionOptions: SelectOption[] = [
  { label: "居左", value: "left" },
  { label: "居中", value: "center" },
  { label: "居右", value: "right" },
];

/** 歌词滚动位置 */
export const lyricsBlockOptions: SelectOption[] = [
  { label: "靠近顶部", value: "start" },
  { label: "水平居中", value: "center" },
];

/** 默认加载数量 */
export const loadSizeOptions: SelectOption[] = [
  { label: "少一点（ 30 条 ）", value: "30" },
  { label: "差不多刚刚好（ 50 条 ）", value: "50" },
  { label: "我要很多（ 100 条 ）", value: "100" },
];

/** 搜索结果加载数量(旧页无独立控件,选项与默认加载数量对齐) */
export const searchLoadSizeOptions: SelectOption[] = [
  { label: "少一点（ 30 条 ）", value: "30" },
  { label: "差不多刚刚好（ 50 条 ）", value: "50" },
  { label: "我要很多（ 100 条 ）", value: "100" },
];
