import { expect, test } from "vitest";
import { desktopLyricColor, normalizeDesktopLyricFallback } from "../src/platform/desktop-lyric-color";

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
