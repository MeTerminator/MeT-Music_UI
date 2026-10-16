import { expect, test } from "vitest";
import { desktopLyricColor, normalizeDesktopLyricFallback, vividDesktopLyricColor } from "../src/platform/desktop-lyric-color";

test("white and near-white foregrounds use default green", () => {
  for (const color of ["255, 255, 255", "240, 232, 222", "#EEEEEE"]) {
    expect(desktopLyricColor(color, "#04CD6F")).toBe("4, 205, 111");
  }
});

test("custom fallback is sent in host RGB format", () => {
  expect(desktopLyricColor("255, 255, 255", "#ff8800")).toBe("255, 136, 0");
});

test("colored, dark, missing and invalid colors are preserved", () => {
  for (const color of ["255, 200, 100", "180, 50, 40", "30, 30, 30", "190, 190, 190", undefined, "", "bad", "300, 300, 300"]) {
    expect(desktopLyricColor(color, "#04CD6F")).toBe(color);
  }
});

test("invalid persisted fallback values return to the default", () => {
  for (const value of [undefined, null, "", "red", "#123", 123]) {
    expect(normalizeDesktopLyricFallback(value)).toBe("#04CD6F");
  }
  expect(normalizeDesktopLyricFallback("#aabbcc")).toBe("#AABBCC");
});


test("desktop vivid colors preserve hue, boost chroma and keep neutrals", () => {
  for (const color of ["255,205,110", "255,180,205", "170,215,255", "175,240,190", "220,195,255", "24,65,90", "40,30,55"]) {
    const before = color.split(",").map(Number);
    const after = vividDesktopLyricColor(color)!.split(",").map(Number);
    const max = Math.max(...after), min = Math.min(...after);
    expect(max).toBeGreaterThanOrEqual(250);
    expect((max - min) / max).toBeGreaterThanOrEqual(0.875);
    const fraction = (rgb: number[], i: number) => (rgb[i] - Math.min(...rgb)) / (Math.max(...rgb) - Math.min(...rgb));
    for (let i = 0; i < 3; i++) expect(Math.abs(fraction(before, i) - fraction(after, i))).toBeLessThan(0.005);
  }
  for (const color of ["255, 255, 255", "180, 180, 180", "0, 0, 0", "250, 249, 249"]) {
    expect(vividDesktopLyricColor(color)).toBe(color);
  }
  for (const color of [undefined, "", "255,,0", "256,0,0", "-1,0,0", "red"]) {
    expect(vividDesktopLyricColor(color)).toBeNull();
  }
  let previous: number[] | undefined;
  for (let green = 255; green >= 215; green--) {
    const rgb = vividDesktopLyricColor(`255,${green},${green}`)!.split(",").map(Number);
    if (previous) expect(Math.max(...rgb.map((v, i) => Math.abs(v - previous![i])))).toBeLessThan(15);
    previous = rgb;
  }
});
