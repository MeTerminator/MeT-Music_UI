/**
 * 主题系统(等价于旧 Provider.vue + $changeThemeColor 的职责):
 *   - settings.themeType → html[data-theme](dark/light,CSS 变量在 styles.css)
 *   - status.coverTheme + settings.themeAutoCover → 覆写 --met-primary /
 *     --met-cover-*(主题色跟随封面;取色由 platform/cover-color.ts 写入 store)
 */
import { useSettingsStore } from "@/stores/settings";
import { useStatusStore } from "@/stores/status";

interface CoverThemeSide {
  primary?: string;
  shade?: string;
  shadeTwo?: string;
  bg?: string;
  mainBg?: string;
}

const COVER_VARS = ["--met-cover-primary", "--met-cover-bg", "--met-cover-shade"] as const;

const applyTheme = (): void => {
  const { themeType, themeAutoCover } = useSettingsStore.getState();
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
    if (side.mainBg) style.setProperty("--met-cover-bg", `rgb(${side.mainBg})`);
    if (side.shade) style.setProperty("--met-cover-shade", `rgb(${side.shade})`);
  } else {
    style.removeProperty("--met-primary");
    for (const v of COVER_VARS) style.removeProperty(v);
  }
};

/** 应用启动时调用一次;此后随 store 变化自动生效 */
export const initTheme = (): void => {
  let lastCoverTheme = useStatusStore.getState().coverTheme;
  let lastThemeType = useSettingsStore.getState().themeType;
  let lastAutoCover = useSettingsStore.getState().themeAutoCover;

  useStatusStore.subscribe((s) => {
    if (s.coverTheme !== lastCoverTheme) {
      lastCoverTheme = s.coverTheme;
      applyTheme();
    }
  });
  useSettingsStore.subscribe((s) => {
    if (s.themeType !== lastThemeType || s.themeAutoCover !== lastAutoCover) {
      lastThemeType = s.themeType;
      lastAutoCover = s.themeAutoCover;
      applyTheme();
    }
  });
  applyTheme();
};
