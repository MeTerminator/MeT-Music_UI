/**
 * 字体系统(等价于旧 Provider.vue 的 fontConfigs + updateSiteFont/updateLyricFont):
 *   - settings.siteFont  → html 上写 --met-site-font(styles.css body 使用)
 *   - settings.lyricFont → html 上写 --met-lyric-font / --met-lyric-font-weight
 *     (歌词容器通过 styles.css 的 .lyric-font 工具类消费)
 * 内置字体的 @font-face 声明位于 public/fonts.css(index.html 引入)。
 */
import { useSettingsStore } from "@/stores/settings";

/** 字体枚举 → font-family / font-weight(与旧 Provider.vue fontConfigs 一致) */
const fontConfigs: Record<string, { family: string; weight: string }> = {
  harmony_reg: { family: '"HarmonyOS_Regular", system-ui', weight: "normal" },
  harmony_bold: {
    family: '"HarmonyOS_Bold", "HarmonyOS_Regular", system-ui',
    weight: "bold",
  },
  pingfang_reg: {
    family: '"PingFangSC_Regular", "SF_Pro_Regular", system-ui',
    weight: "normal",
  },
  pingfang_semi: {
    family: '"PingFangSC_Semibold", "SF_Pro_Semibold", "PingFangSC_Regular", system-ui',
    weight: "500",
  },
  system: { family: "system-ui, -apple-system, sans-serif", weight: "bold" },
};

const applyFonts = (): void => {
  const { siteFont, lyricFont } = useSettingsStore.getState();
  const style = document.documentElement.style;

  const siteConfig = fontConfigs[siteFont];
  if (siteConfig) {
    style.setProperty("--met-site-font", siteConfig.family);
  } else {
    // 未知枚举回退 styles.css 的默认字体栈
    style.removeProperty("--met-site-font");
  }

  const lyricConfig = fontConfigs[lyricFont];
  if (lyricConfig) {
    style.setProperty("--met-lyric-font", lyricConfig.family);
    style.setProperty("--met-lyric-font-weight", lyricConfig.weight);
  } else {
    style.removeProperty("--met-lyric-font");
    style.removeProperty("--met-lyric-font-weight");
  }
};

/** 应用启动时调用一次(由 platform/theme.ts 的 initTheme 接入);此后随 store 变化自动生效 */
export const initFonts = (): void => {
  let lastSiteFont = useSettingsStore.getState().siteFont;
  let lastLyricFont = useSettingsStore.getState().lyricFont;

  useSettingsStore.subscribe((s) => {
    if (s.siteFont !== lastSiteFont || s.lyricFont !== lastLyricFont) {
      lastSiteFont = s.siteFont;
      lastLyricFont = s.lyricFont;
      applyFonts();
    }
  });
  applyFonts();
};
