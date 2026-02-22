import {
  themeFromSourceColor,
  QuantizerCelebi,
  Hct,
  Score,
} from "@material/material-color-utilities";
import { siteSettings, siteStatus } from "@/stores";
import { getGradientFromPalette, argb2Rgb, rgb2Argb } from "@/utils/color-utils";
import { chunk } from "@/utils/helper";
import ColorThief from "colorthief";

/**
 * 根据图像的主色获取渐变色
 * @param {string} coverSrc - 图片 URL
 * @returns {Promise<string>} - 生成的渐变色ß
 */
export const getCoverGradient = (coverSrc) => {
  return new Promise((resolve, reject) => {
    try {
      let newCoverSrc;
      if (coverSrc.startsWith("/api/web/local/music/file/")) {
        newCoverSrc = coverSrc;
      } else {
        newCoverSrc = `/api/web/album/cover/pic?pic=${coverSrc.replace("https://y.qq.com/music/photo_new/", "").replace("?param=100y100", "")}`;
      }
      
      const colorThief = new ColorThief();
      const image = new Image();
      image.crossOrigin = "Anonymous";
      image.src = newCoverSrc;

      image.onload = async () => {
        try {
          let palette = await colorThief.getPalette(image);
          if (!palette || palette.length === 0) {
            console.warn("getPalette 失败，尝试 getColor");
            const dominantColor = await colorThief.getColor(image);
            palette = [dominantColor]; // 用主色填充调色板
          }
          const gradient = getGradientFromPalette(palette);
          console.log("图片加载完成，渐变色：", gradient);
          calcAccentColor(image, palette[0]);
          resolve(gradient);
        } catch (err) {
          console.error("颜色提取失败，使用默认渐变色：", err);
          resolve("linear-gradient(-45deg, #666, #fff)");
        }
      };
    } catch (error) {
      console.error("图片渐变色生成失败：", error);
      reject("linear-gradient(-45deg, #666, #fff)");
    }
  });
};

/**
 * 计算图片的主色并更新主题
 * @param {HTMLImageElement} dom - 包含图像的 DOM 元素
 * @param {Array} dominantColor - 主要颜色（[R, G, B]）
 */
const calcAccentColor = (dom, dominantColor) => {
  const status = siteStatus();
  const settings = siteSettings();

  const canvas = document.createElement("canvas");
  canvas.width = 50;
  canvas.height = 50;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(dom, 0, 0, dom.naturalWidth, dom.naturalHeight, 0, 0, 50, 50);

  const pixels = chunk(ctx.getImageData(0, 0, 50, 50).data, 4).map((pixel) => {
    return (
      (((pixel[3] << 24) >>> 0) | ((pixel[0] << 16) >>> 0) | ((pixel[1] << 8) >>> 0) | pixel[2]) >>>
      0
    );
  });

  const quantizedColors = QuantizerCelebi.quantize(pixels, 64); // 限制颜色数为 64
  const sortedColors = Array.from(quantizedColors).sort((a, b) => b[1] - a[1]);

  const topColors = sortedColors.slice(0, 10).map((x) => argb2Rgb(x[0])); // 取前 10 颜色
  const ranked = Score.score(new Map(sortedColors.slice(0, 10))); // 评分范围缩小
  const top = ranked[0] || rgb2Argb(...dominantColor); // 选取最佳颜色

  // 计算平均亮度
  const avgBrightness =
    topColors.reduce((sum, c) => sum + (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114), 0) /
    topColors.length;

  // 计算主题色
  const theme = themeFromSourceColor(top);
  const variant = settings.themeAutoCoverType;

  status.coverTheme = {
    dark: generateThemeColors(theme, variant, true, avgBrightness),
    light: generateThemeColors(theme, variant, false, avgBrightness),
  };

  if (typeof $changeThemeColor !== "undefined" && settings.themeAutoCover) {
    $changeThemeColor(status.coverTheme, settings.themeAutoCover);
  }
};

/**
 * 生成主题颜色
 * @param {object} theme - 主题对象
 * @param {string} variant - 颜色变体
 * @param {boolean} isDark - 是否为深色模式
 * @param {number} brightness - 亮度值
 * @returns {object} - 生成的主题色对象
 */
const generateThemeColors = (theme, variant, isDark, brightness) => {
  const adjustBrightness = brightness > 150 ? -20 : 20;

  return {
    primary: getAccentColor(
      Hct.from(
        theme.palettes[variant].hue,
        theme.palettes[variant].chroma,
        100 + adjustBrightness,
      ).toInt(),
    ),
    shade: getAccentColor(
      Hct.from(
        theme.palettes[variant].hue,
        theme.palettes[variant].chroma,
        isDark ? 25 : 80,
      ).toInt(),
    ),
    shadeTwo: getAccentColor(
      Hct.from(
        theme.palettes[variant].hue,
        theme.palettes[variant].chroma,
        isDark ? 15 : 90,
      ).toInt(),
    ),
    bg: getAccentColor(
      Hct.from(
        theme.palettes[variant].hue,
        theme.palettes[variant].chroma,
        isDark ? 90 : 20,
      ).toInt(),
    ),
    mainBg: getAccentColor(
      Hct.from(
        theme.palettes[variant].hue,
        theme.palettes[variant].chroma,
        isDark ? 10 : 100,
      ).toInt(),
    ),
  };
};

/**
 * 主色以 RGB 格式返回
 * @param {number} argb - ARGB 颜色
 * @returns {string} - RGB 格式颜色
 */
const getAccentColor = (argb) => {
  const [r, g, b] = [...argb2Rgb(argb)];
  return `${r}, ${g}, ${b}`;
};
