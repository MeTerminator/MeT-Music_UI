import { expect, test } from "vitest";
import { Hct, themeFromSourceColor } from "@material/material-color-utilities";
import { extractCoverDominant } from "../src/platform/cover-dominant";
import { argb2Rgb, getGradientFromPalette } from "../src/platform/color-utils";

const pixels = (...regions: [number, number, number, number, number][]) =>
  regions.flatMap(([r, g, b, a, count]) => Array.from({ length: count }, () => [r, g, b, a]).flat());

for (const [name, main, accent] of [
  ["red", [150, 65, 60], [0, 255, 0]],
  ["orange", [205, 135, 85], [0, 80, 255]],
  ["blue", [65, 95, 170], [255, 85, 0]],
] as const) {
  test(`${name} majority beats a saturated accent`, () => {
    const result = extractCoverDominant(pixels([...main, 255, 800], [...accent, 255, 200]))!;
    expect(argb2Rgb(result.color)).toEqual([...main]);
    const expected = Hct.fromInt(result.color).hue;
    const theme = themeFromSourceColor(result.color);
    expect(Math.abs(theme.palettes.secondary.hue - expected)).toBeLessThan(1);
  });
}

test("combines shades of red before comparing areas", () => {
  const result = extractCoverDominant(pixels(
    [130, 35, 30, 255, 250], [190, 60, 50, 255, 250],
    [225, 100, 85, 255, 200], [20, 170, 60, 255, 300],
  ))!;
  const [r, g, b] = argb2Rgb(result.color);
  expect(r).toBeGreaterThan(g * 2);
  expect(r).toBeGreaterThan(b * 2);
});

test("handles red across the hue wraparound", () => {
  const result = extractCoverDominant(pixels(
    [180, 30, 70, 255, 350], [180, 30, 30, 255, 350], [20, 170, 60, 255, 300],
  ))!;
  expect(argb2Rgb(result.color)[0]).toBeGreaterThan(150);
});

test("neutral majority stays neutral, with no default blue", () => {
  const result = extractCoverDominant(pixels([190, 190, 190, 255, 900], [0, 80, 255, 255, 100]))!;
  expect(argb2Rgb(result.color)).toEqual([190, 190, 190]);
});

test("ignores transparent pixels and weights brightness by area", () => {
  const result = extractCoverDominant(pixels([255, 0, 0, 0, 900], [40, 40, 40, 255, 75], [200, 200, 200, 255, 25]))!;
  expect(result.brightness).toBeCloseTo(80);
  expect(extractCoverDominant(pixels([255, 0, 0, 0, 100]))).toBeNull();
  expect(extractCoverDominant([])).toBeNull();
});

for (let count = 0; count <= 10; count++) {
  test(`gradient handles ${count} palette colors without mutation`, () => {
    const palette = Array.from({ length: count }, (_, i) => [180 + i * 5, 50 + i * 5, 30]);
    const original = structuredClone(palette);
    const gradient = getGradientFromPalette(palette);
    expect(gradient).toMatch(/^linear-gradient\(/);
    expect(gradient).not.toMatch(/undefined|NaN/);
    expect(palette).toEqual(original);
  });
}
