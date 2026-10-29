import { describe, expect, it } from "vitest";
import {
  normalizeQQPlaybackLevel,
  qqDownloadOptions,
  qqPlaybackQualities,
} from "../src/qq-qualities";

describe("QQ browser playback and exact download choices", () => {
  it("excludes spatial codecs and formats the current browser cannot decode", () => {
    const keys = qqPlaybackQualities(["mp3", "flac"]).map((q) => q.key);
    expect(keys).toContain("HQ");
    expect(keys).toContain("RS");
    expect(keys).not.toContain("OGG320");
    for (const key of [
      "DA",
      "DTS",
      "DTSX",
      "RA360",
      "Q360V3",
      "Q360V4",
      "NAC",
    ]) {
      expect(keys).not.toContain(key);
    }
    expect(qqPlaybackQualities([])).toEqual([]);
  });

  it("keeps supported existing settings and migrates download-only/unknown settings", () => {
    expect(normalizeQQPlaybackLevel("q360v2")).toBe("q360v2");
    expect(normalizeQQPlaybackLevel("nac")).toBe("nac");
    expect(normalizeQQPlaybackLevel("dts")).toBe("hq");
    expect(normalizeQQPlaybackLevel("unknown")).toBe("hq");
  });

  it("shows only resources advertised for the song, and all codecs remain downloadable", () => {
    expect(qqDownloadOptions(["DA", "Q360V3"]).map((q) => q.value)).toEqual([
      "Q360V3",
      "DA",
    ]);
    expect(qqDownloadOptions([])).toEqual([]);
    const catalogue = qqDownloadOptions().map((q) => q.value);
    expect(catalogue).toContain("DTS");
    expect(catalogue).toContain("Q360V4");
    for (const key of [
      "AI_PIANO",
      "AI_SERINETTE",
      "VOCAL",
      "MULTITRACK",
      "DJ",
      "RANDB",
      "VIBE",
      "HEALING",
      "RAP",
      "VINYL",
      "EAR",
    ]) {
      expect(catalogue).not.toContain(key);
      expect(qqDownloadOptions([key])).toEqual([]);
      expect(normalizeQQPlaybackLevel(key)).toBe("hq");
    }
    expect(catalogue).toHaveLength(24);
  });
});
