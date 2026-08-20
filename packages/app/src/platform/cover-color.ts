/**
 * 封面取色(移植自旧 src/utils/cover-color.js):
 *   - getCoverGradient 提取封面调色板并生成 CSS 渐变
 *   - calcAccentColor 计算主题强调色,写入 status.coverTheme
 *     (theme.ts 已订阅 store,自动应用,不再需要旧 $changeThemeColor)
 */
import {
  themeFromSourceColor,
  QuantizerCelebi,
  Hct,
  Score,
  type Theme,
  type TonalPalette,
} from "@material/material-color-utilities";
import { getColorSync, getPaletteSync } from "colorthief";
import { chunk } from "@met/core";
import { useSettingsStore } from "@/stores/settings";
import { useStatusStore } from "@/stores/status";
import { argb2Rgb, getGradientFromPalette, rgb2Argb } from "@/platform/color-utils";

const DEFAULT_GRADIENT = "linear-gradient(-45deg, #666, #fff)";

/** 单侧(dark/light)封面主题色,值为 "r, g, b" 字符串 */
interface CoverThemeColors {
  primary: string;
  shade: string;
  shadeTwo: string;
  bg: string;
  mainBg: string;
}

/**
 * 封面背景上的前景色组("r, g, b" 字符串)。
 * 全屏播放器的背景恒为偏深的封面模糊/动效,与站点明暗主题无关,
 * 因此前景恒取浅色调 —— 消费方用语义字段,不再自行猜 dark/light 侧
 * (dark/light 两侧字段方向并不一致:bg 是界面强调色而 shade 是背景前景层,
 *  按 themeType 选边曾导致深色主题下全屏出现深字深底)。
 */
export interface OnCoverColors {
  /** 主文字/图标(HCT tone 90) */
  main: string;
  /** 次级文字(HCT tone 80) */
  soft: string;
  /** 强调色(近白的品牌色,与两侧 primary 同算法) */
  accent: string;
}

/**
 * 根据图像的主色获取渐变色
 * @param coverSrc - 图片 URL
 * @returns 生成的渐变色
 */
export const getCoverGradient = (coverSrc: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      let newCoverSrc: string;
      if (coverSrc.startsWith("/api/web/local/music/file/")) {
        newCoverSrc = coverSrc;
      } else {
        newCoverSrc = `/api/web/album/cover/pic?pic=${coverSrc.replace("https://y.qq.com/music/photo_new/", "").replace("?param=100y100", "")}`;
      }

      const image = new Image();
      image.crossOrigin = "Anonymous";
      image.src = newCoverSrc;

      image.onload = () => {
        try {
          let paletteColors = getPaletteSync(image);
          if (!paletteColors || paletteColors.length === 0) {
            console.warn("getPalette 失败，尝试 getColor");
            const dominantColor = getColorSync(image);
            if (!dominantColor) throw new Error("getColor 失败");
            paletteColors = [dominantColor];
          }
          const palette = paletteColors.map((color) => [...color.array()] as number[]);
          const gradient = getGradientFromPalette(palette);
          console.log("图片加载完成，渐变色：", gradient);
          calcAccentColor(image, palette[0]);
          resolve(gradient);
        } catch (err) {
          console.error("颜色提取失败，使用默认渐变色：", err);
          resolve(DEFAULT_GRADIENT);
        }
      };

      // 旧实现缺失 onerror,图片加载失败时 Promise 会永久挂起;此处修复为回退默认渐变
      image.onerror = () => {
        console.error("封面图片加载失败，使用默认渐变色：", newCoverSrc);
        resolve(DEFAULT_GRADIENT);
      };
    } catch (error) {
      console.error("图片渐变色生成失败：", error);
      reject(DEFAULT_GRADIENT);
    }
  });
};

/**
 * 计算图片的主色并更新主题(写入 useStatusStore.coverTheme)
 * @param dom - 包含图像的 DOM 元素
 * @param dominantColor - 主要颜色([R, G, B])
 */
const calcAccentColor = (dom: HTMLImageElement, dominantColor: number[]): void => {
  const settings = useSettingsStore.getState();

  const canvas = document.createElement("canvas");
  canvas.width = 50;
  canvas.height = 50;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(dom, 0, 0, dom.naturalWidth, dom.naturalHeight, 0, 0, 50, 50);

  const pixels = chunk(Array.from(ctx.getImageData(0, 0, 50, 50).data), 4).map((pixel) => {
    return (
      (((pixel[3] << 24) >>> 0) | ((pixel[0] << 16) >>> 0) | ((pixel[1] << 8) >>> 0) | pixel[2]) >>>
      0
    );
  });

  const quantizedColors = QuantizerCelebi.quantize(pixels, 64); // 限制颜色数为 64
  const sortedColors = Array.from(quantizedColors).sort((a, b) => b[1] - a[1]);

  const topColors = sortedColors.slice(0, 10).map((x) => argb2Rgb(x[0])); // 取前 10 颜色
  const ranked = Score.score(new Map(sortedColors.slice(0, 10))); // 评分范围缩小
  const top = ranked[0] || rgb2Argb(dominantColor[0], dominantColor[1], dominantColor[2]); // 选取最佳颜色

  // 计算平均亮度
  const avgBrightness =
    topColors.reduce((sum, c) => sum + (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114), 0) /
    topColors.length;

  // 计算主题色
  const theme = themeFromSourceColor(top);
  const variant = settings.themeAutoCoverType;

  useStatusStore.setState({
    coverTheme: {
      dark: generateThemeColors(theme, variant, true, avgBrightness),
      light: generateThemeColors(theme, variant, false, avgBrightness),
      onCover: generateOnCoverColors(theme, variant, avgBrightness),
    },
  });
};

/**
 * 生成主题颜色
 * @param theme - 主题对象
 * @param variant - 颜色变体(settings.themeAutoCoverType)
 * @param isDark - 是否为深色模式
 * @param brightness - 亮度值
 * @returns 生成的主题色对象
 */
const generateThemeColors = (
  theme: Theme,
  variant: string,
  isDark: boolean,
  brightness: number,
): CoverThemeColors => {
  const adjustBrightness = brightness > 150 ? -20 : 20;
  // 与旧实现一致:按 settings.themeAutoCoverType 索引调色板
  const palette = (theme.palettes as unknown as Record<string, TonalPalette>)[variant];

  return {
    primary: getAccentColor(Hct.from(palette.hue, palette.chroma, 100 + adjustBrightness).toInt()),
    shade: getAccentColor(Hct.from(palette.hue, palette.chroma, isDark ? 25 : 80).toInt()),
    shadeTwo: getAccentColor(Hct.from(palette.hue, palette.chroma, isDark ? 15 : 90).toInt()),
    bg: getAccentColor(Hct.from(palette.hue, palette.chroma, isDark ? 90 : 20).toInt()),
    mainBg: getAccentColor(Hct.from(palette.hue, palette.chroma, isDark ? 10 : 100).toInt()),
  };
};

/** 生成封面背景上的前景色组(见 OnCoverColors 注释) */
const generateOnCoverColors = (
  theme: Theme,
  variant: string,
  brightness: number,
): OnCoverColors => {
  const adjustBrightness = brightness > 150 ? -20 : 20;
  const palette = (theme.palettes as unknown as Record<string, TonalPalette>)[variant];
  return {
    main: getAccentColor(Hct.from(palette.hue, palette.chroma, 90).toInt()),
    soft: getAccentColor(Hct.from(palette.hue, palette.chroma, 80).toInt()),
    accent: getAccentColor(Hct.from(palette.hue, palette.chroma, 100 + adjustBrightness).toInt()),
  };
};

/**
 * 主色以 RGB 格式返回
 * @param argb - ARGB 颜色
 * @returns "r, g, b" 格式颜色字符串
 */
const getAccentColor = (argb: number): string => {
  const [r, g, b] = [...argb2Rgb(argb)];
  return `${r}, ${g}, ${b}`;
};
