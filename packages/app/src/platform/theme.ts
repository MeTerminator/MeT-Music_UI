/**
 * 主题系统(等价于旧 Provider.vue + $changeThemeColor 的职责):
 *   - settings.themeType → html[data-theme](dark/light,CSS 变量在 styles.css)
 *   - status.coverTheme + settings.themeAutoCover → 覆写 --met-primary /
 *     --met-cover-*(主题色跟随封面;取色由 platform/cover-color.ts 写入 store)
 *   - settings.themeTypeName → 主题色预设(platform/theme-colors.ts,
 *     仅在「封面跟随」未生效时应用,优先级对照旧 Provider.vue)
 *   - 字体(settings.siteFont/lyricFont)由 platform/fonts.ts 负责,initTheme 内接入
 *   - <meta name="theme-color"> 随主题同步为 --met-bg 实际色(对照旧 Provider.vue
 *     changeTheme 写死 #ffffff/#18181c,此处改读 CSS 变量计算值)
 *   - settings.themeAuto 开启时监听 OS 明暗变化实时跟随(对照旧 Provider.vue
 *     osThemeRef watch;themeAuto 关闭时移除监听)
 */
import { useSettingsStore } from "@/stores/settings";
import { useStatusStore } from "@/stores/status";
import { initFonts } from "./fonts";
import { themeColorPresets } from "./theme-colors";

interface CoverThemeSide {
  primary?: string;
  shade?: string;
  shadeTwo?: string;
  bg?: string;
  mainBg?: string;
}

const COVER_VARS = ["--met-cover-primary", "--met-cover-bg", "--met-cover-shade"] as const;

/**
 * 主色上的文字色:按主色相对亮度(0-255 域)选深字或反白,
 * 深色封面取色作按钮底时文字才不会糊(阈值 160 经验值,偏向反白)
 */
const primaryFgFor = (r: number, g: number, b: number): string =>
  0.2126 * r + 0.7152 * g + 0.0722 * b > 160 ? "#10241a" : "#ffffff";

/** 解析 "#rrggbb" 或 "r, g, b" 为 RGB 三元组;解析失败返回 null */
const parseRgb = (color: string): [number, number, number] | null => {
  const hex = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const parts = color.split(",").map((p) => Number(p.trim()));
  if (parts.length === 3 && parts.every((p) => Number.isFinite(p))) {
    return parts as [number, number, number];
  }
  return null;
};

/** 同步 <meta name="theme-color"> 为当前 --met-bg 计算值(不存在则创建) */
const syncMetaThemeColor = (): void => {
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--met-bg").trim();
  if (!bg) return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = bg;
};

const applyTheme = (): void => {
  const { themeType, themeAutoCover, themeTypeName } = useSettingsStore.getState();
  const { coverTheme } = useStatusStore.getState();
  const rootEl = document.documentElement;
  rootEl.dataset.theme = themeType;

  const side = (
    themeType === "light"
      ? (coverTheme as { light?: CoverThemeSide })?.light
      : (coverTheme as { dark?: CoverThemeSide })?.dark
  ) as CoverThemeSide | undefined;

  const style = rootEl.style;
  if (themeAutoCover && side?.bg) {
    // coverTheme 的值为 "r, g, b" 字符串(与旧实现一致)。
    // 强调色取 side.bg(旧 $changeThemeColor 即用 bg);
    // primary 字段是 HCT tone 100+ 的纯白,不能作为强调色。
    style.setProperty("--met-primary", `rgb(${side.bg})`);
    style.setProperty("--met-cover-primary", `rgb(${side.bg})`);
    const rgb = parseRgb(side.bg);
    if (rgb) style.setProperty("--met-primary-fg", primaryFgFor(...rgb));
    if (side.mainBg) style.setProperty("--met-cover-bg", `rgb(${side.mainBg})`);
    if (side.shade) style.setProperty("--met-cover-shade", `rgb(${side.shade})`);
  } else {
    // 封面跟随关闭(或暂无封面主题)时,按 themeTypeName 应用主题色预设;
    // 未知预设名回退 styles.css 的默认 --met-primary
    const preset = themeColorPresets[themeTypeName];
    if (preset) {
      style.setProperty("--met-primary", preset.primaryColor);
      const rgb = parseRgb(preset.primaryColor);
      if (rgb) style.setProperty("--met-primary-fg", primaryFgFor(...rgb));
    } else {
      style.removeProperty("--met-primary");
      style.removeProperty("--met-primary-fg");
    }
    for (const v of COVER_VARS) style.removeProperty(v);
  }

  // 主题(含明暗)落地后同步 PWA 状态栏色
  syncMetaThemeColor();
};

/**
 * OS 明暗实时跟随(旧 Provider.vue 的 osThemeRef watch):
 * themeAuto 开启时监听 prefers-color-scheme 变化写回 themeType,
 * 关闭时移除监听(含清理)。
 */
const initOsThemeFollow = (): void => {
  if (typeof window.matchMedia !== "function") return;
  const mql = window.matchMedia("(prefers-color-scheme: dark)");

  const onChange = (e: MediaQueryListEvent): void => {
    useSettingsStore.setState({ themeType: e.matches ? "dark" : "light" });
  };

  let listening = false;
  const sync = (themeAuto: boolean): void => {
    if (themeAuto && !listening) {
      mql.addEventListener("change", onChange);
      listening = true;
      // 开启(或启动)时先对齐一次当前 OS 主题
      const osType = mql.matches ? "dark" : "light";
      if (useSettingsStore.getState().themeType !== osType) {
        useSettingsStore.setState({ themeType: osType });
      }
    } else if (!themeAuto && listening) {
      mql.removeEventListener("change", onChange);
      listening = false;
    }
  };

  let lastThemeAuto = useSettingsStore.getState().themeAuto;
  useSettingsStore.subscribe((s) => {
    if (s.themeAuto !== lastThemeAuto) {
      lastThemeAuto = s.themeAuto;
      sync(s.themeAuto);
    }
  });
  sync(lastThemeAuto);
};

/** 应用启动时调用一次;此后随 store 变化自动生效 */
export const initTheme = (): void => {
  let lastCoverTheme = useStatusStore.getState().coverTheme;
  let lastThemeType = useSettingsStore.getState().themeType;
  let lastAutoCover = useSettingsStore.getState().themeAutoCover;
  let lastThemeTypeName = useSettingsStore.getState().themeTypeName;

  useStatusStore.subscribe((s) => {
    if (s.coverTheme !== lastCoverTheme) {
      lastCoverTheme = s.coverTheme;
      applyTheme();
    }
  });
  useSettingsStore.subscribe((s) => {
    if (
      s.themeType !== lastThemeType ||
      s.themeAutoCover !== lastAutoCover ||
      s.themeTypeName !== lastThemeTypeName
    ) {
      lastThemeType = s.themeType;
      lastAutoCover = s.themeAutoCover;
      lastThemeTypeName = s.themeTypeName;
      applyTheme();
    }
  });
  applyTheme();
  // OS 明暗实时跟随(themeAuto)
  initOsThemeFollow();
  // 字体设置(siteFont/lyricFont → CSS 变量)
  initFonts();
};
