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

for (const background of [[255, 255, 255], [240, 232, 222], [0, 0, 0], [30, 35, 42]]) {
  test(`excludes near-white/black background ${background.join(",")}`, () => {
    const result = extractCoverDominant(pixels(
      [background[0], background[1], background[2], 255, 850],
      [205, 135, 85, 255, 100], [0, 80, 255, 255, 50],
    ))!;
    expect(argb2Rgb(result.color)).toEqual([205, 135, 85]);
  });
}

test("excludes white and black together before comparing remaining areas", () => {
  const result = extractCoverDominant(pixels(
    [245, 245, 245, 255, 500], [20, 20, 20, 255, 350],
    [180, 50, 40, 255, 100], [20, 170, 60, 255, 50],
  ))!;
  expect(argb2Rgb(result.color)).toEqual([180, 50, 40]);
});

for (const main of [[255, 255, 0], [15, 20, 100]]) {
  test(`preserves saturated bright/dark color ${main.join(",")}`, () => {
    const result = extractCoverDominant(pixels(
      [main[0], main[1], main[2], 255, 800], [180, 50, 40, 255, 200],
    ))!;
    expect(argb2Rgb(result.color)).toEqual(main);
  });
}

test("all near-white/black cover falls back to neutral without losing brightness", () => {
  const result = extractCoverDominant(pixels([240, 232, 222, 255, 750], [30, 35, 42, 255, 250]))!;
  const [r, g, b] = argb2Rgb(result.color);
  expect(r).toBe(g);
  expect(g).toBe(b);
  expect(result.brightness).toBeCloseTo((240 * 0.299 + 232 * 0.587 + 222 * 0.114) * 0.75 + (30 * 0.299 + 35 * 0.587 + 42 * 0.114) * 0.25);
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
