import { Hct, QuantizerCelebi } from "@material/material-color-utilities";
import { argb2Rgb, rgb2Argb } from "./color-utils";

/** 按可见面积选择主色；相近色相的明暗变化合并，避免阴影把主色拆散。 */
export const extractCoverDominant = (rgba: ArrayLike<number>) => {
  const pixels: number[] = [];
  let brightness = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    // 忽略透明区域，避免透明像素中的隐藏 RGB 影响取色。
    if (rgba[i + 3] < 128) continue;
    pixels.push(rgb2Argb(rgba[i], rgba[i + 1], rgba[i + 2]) >>> 0);
    brightness += rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
  }
  if (!pixels.length) return null;

  const colors = Array.from(QuantizerCelebi.quantize(pixels, 64), ([argb, population]) => ({
    argb,
    population,
    hct: Hct.fromInt(argb),
  })).sort((a, b) => b.population - a.population);
  const hueDistance = (a: number, b: number) => {
    const distance = Math.abs(a - b);
    return Math.min(distance, 360 - distance);
  };
  const groups = colors.map((center) => {
    const members = colors.filter((color) =>
      center.hct.chroma < 8
        ? color.hct.chroma < 8
        : color.hct.chroma >= 8 && hueDistance(center.hct.hue, color.hct.hue) <= 20,
    );
    return { members, population: members.reduce((sum, c) => sum + c.population, 0) };
  });
  groups.sort((a, b) => b.population - a.population);
  const winner = groups[0];
  // 仅平均获胜色系，绝不把红与绿等不同色系混成封面中不存在的颜色。
  const rgb = [0, 0, 0];
  for (const color of winner.members) {
    argb2Rgb(color.argb).forEach((channel, i) => {
      rgb[i] += channel * color.population / winner.population;
    });
  }
  return {
    color: rgb2Argb(...rgb.map(Math.round) as [number, number, number]) >>> 0,
    brightness: brightness / pixels.length,
  };
};
