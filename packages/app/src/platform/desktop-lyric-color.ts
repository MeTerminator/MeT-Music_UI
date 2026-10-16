/** 桌面歌词偏白主题色的默认备选色。 */
export const DEFAULT_DESKTOP_LYRIC_FALLBACK = "#04CD6F";

export const normalizeDesktopLyricFallback = (value: unknown): string =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : DEFAULT_DESKTOP_LYRIC_FALLBACK;

/** 宿主颜色沿用 "r, g, b" 格式，仅替换高亮、低色差的近白前景色。 */
export const desktopLyricColor = (color: string | undefined, fallback: string): string | undefined => {
  if (!color) return color;
  const hex = /^#([\da-f]{6})$/i.exec(color.trim());
  const rgb = hex
    ? [0, 2, 4].map((offset) => parseInt(hex[1].slice(offset, offset + 2), 16))
    : color.split(",").map((part) => Number(part.trim()));
  if (rgb.length !== 3 || rgb.some((value) => !Number.isFinite(value) || value < 0 || value > 255)) return color;
  const min = Math.min(...rgb);
  const max = Math.max(...rgb);
  if (min < 220 || max - min > 35) return color;
  const normalized = normalizeDesktopLyricFallback(fallback).slice(1);
  return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16)).join(", ");
};

/** 封面 shadeTwo 为逗号分隔的 RGB。去掉亮色的粉白感并保持色相，输出供宿主直接使用的 RGB。 */
export function vividDesktopLyricColor(shadeTwo: string | undefined): string | null {
  if (!shadeTwo?.trim()) return null;
  const channels = shadeTwo.split(",").map((channel) => channel.trim());
  if (channels.length !== 3 || channels.some((channel) =>
    !/^\d+(?:\.\d+)?$/.test(channel) || Number(channel) > 255
  )) return null;

  const rgb = channels.map(Number);
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  const chroma = max - min;
  const saturation = max === 0 ? 0 : chroma / max;

  // 以 HSV 的饱和度和明度控制“鲜艳”：让主色通道接近满亮度，并去掉
  // 混入的白色。相同 HSV 明度下黄绿自然比蓝紫更亮，无需统一压低亮度。
  // 在低饱和度区平滑淡入，避免灰白封面微小的 RGB 偏差被放大成艳色。
  const t = Math.min(1, Math.max(0, (saturation - 0.02) / 0.10));
  const strength = t * t * (3 - 2 * t);
  if (strength === 0 || chroma === 0) return rgb.join(", ");

  const targetSaturation = saturation + (Math.max(0.88, saturation) - saturation) * strength;
  const targetValue = max + (Math.max(250, max) - max) * strength;
  const targetChroma = targetValue * targetSaturation;
  // 对三个通道使用相同的线性映射，精确保留 RGB 色相，并直接落在 sRGB
  // 色域内；避免浏览器压缩超色域的彩度后，实际显示依然发淡。
  const result = rgb.map((channel) => Math.round(
    targetValue - targetChroma + ((channel - min) / chroma) * targetChroma
  ));
  return result.join(", ");
}
