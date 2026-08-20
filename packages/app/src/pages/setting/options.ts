/**
 * 全局设置页的选项数据(文案照抄旧 src/views/Setting/index.vue)。
 */
import type { SelectOption } from "@/components/ui/select";

/** 音质数据(label 为选项文案,tip 为当前音质说明) */
export const songLevelData: Record<string, { label: string; tip: string; value: string }> = {
  web: {
    label: "普通 WEB",
    tip: "在线流媒体音质",
    value: "web",
  },
  hq: {
    label: "极高 HQ",
    tip: "近 CD 品质的细节体验，最高 320kbps",
    value: "hq",
  },
  sq: {
    label: "无损 SQ",
    tip: "高保真无损音质，最高 48kHz/24bit",
    value: "sq",
  },
  rs: {
    label: "高分辨率音源 Hi-Res",
    tip: "索尼高品质音乐标准，高于 44.1kHz/16bit",
    value: "rs",
  },
  dts: {
    label: "杜比 5.1 声道",
    tip: "六声道环绕声，使人产生犹如身临音乐厅的感觉",
    value: "dts",
  },
  q360v1: {
    label: "臻品全景声 V1",
    tip: "独家自研空间音频，V1 版本，立体声",
    value: "q360v1",
  },
  q360v2: {
    label: "臻品全景声 V2",
    tip: "独家自研空间音频，V2 版本，多声道",
    value: "q360v2",
  },
  qai: {
    label: "臻品母带",
    tip: "还原声音细节，让声音还原更加极致",
    value: "qai",
  },
};

export const songLevelOptions: SelectOption[] = Object.values(songLevelData).map(
  ({ label, value }) => ({ label, value }),
);

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

/** 关闭方式(Electron 专属,文案对齐旧 stores/siteSettings.js 注释与关闭弹窗) */
export const closeTypeOptions: SelectOption<"close" | "hide">[] = [
  { label: "最小化到任务栏", value: "hide" },
  { label: "直接关闭", value: "close" },
];
