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
