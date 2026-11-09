import { songPlatform, type Platform, type Song } from "@met/core";

const tagOptions = {
  qq: [
    { id: "dolby", label: "杜比", levels: ["DA", "DA448", "DA1500", "DAEAC3"] },
    { id: "ra360", label: "360RA", levels: ["RA360"] },
    { id: "dtsx", label: "DTS:X", levels: ["DTSX"] },
    { id: "master", label: "臻品母带", levels: ["QAI"], optional: true },
    { id: "surround", label: "臻品全景声", levels: ["Q360V1", "Q360V2", "Q360V3", "Q360V4"], optional: true },
    { id: "hires", label: "Hi-Res", levels: ["RS"] },
    { id: "dts", label: "DTS", levels: ["DTS"] },
    { id: "sq", label: "SQ", levels: ["SQ"] },
    { id: "hq", label: "HQ", levels: ["HQ", "AAC192", "OGG192", "OGG320"] },
    { id: "nac", label: "NAC", levels: ["NAC"], optional: true },
    { id: "standard", label: "标准", levels: ["WEB", "MP3128", "OGG96", "AAC24", "AAC48"] },
  ],
  netease: [
    { id: "dolby", label: "杜比", levels: ["dolby"] },
    { id: "sky", label: "沉浸环绕声", levels: ["sky"], optional: true },
    { id: "master", label: "超清母带", levels: ["jymaster"], optional: true },
    { id: "vivid", label: "臻音全景声", levels: ["vivid"], optional: true },
    { id: "jyeffect", label: "高清臻音", levels: ["jyeffect"] },
    { id: "hires", label: "Hi-Res", levels: ["hires"] },
    { id: "sq", label: "SQ", levels: ["lossless"] },
    { id: "hq", label: "HQ", levels: ["exhigh"] },
    { id: "higher", label: "较高", levels: ["higher"] },
    { id: "standard", label: "标准", levels: ["standard"] },
  ],
} as const;

type TagId = (typeof tagOptions)[Platform][number]["id"];
export type QualityTagPreference = { id: TagId; enabled: boolean };
export type QualityTagPreferences = Record<Platform, QualityTagPreference[]>;

const defaultPreferences = (platform: Platform): QualityTagPreference[] =>
  tagOptions[platform].map((tag) => ({ id: tag.id, enabled: !("optional" in tag) }));

export const defaultQualityTagPreferences: QualityTagPreferences = {
  qq: defaultPreferences("qq"),
  netease: defaultPreferences("netease"),
};
export const QUALITY_TAG_DEFAULTS_VERSION = 3;

type DefaultSnapshot = { order: readonly TagId[]; enabled: readonly TagId[] };
const previousDefaults: Partial<Record<number, Partial<Record<Platform, DefaultSnapshot>>>> = {
  0: {
    qq: {
      order: ["dolby", "hires", "sq", "hq", "standard", "master", "surround", "dtsx", "dts", "ra360", "nac"],
      enabled: ["dolby", "hires", "sq", "hq", "standard"],
    },
    netease: {
      order: ["dolby", "jyeffect", "hires", "sq", "hq", "standard", "higher", "master", "vivid", "sky"],
      enabled: ["dolby", "jyeffect", "hires", "sq", "hq", "standard"],
    },
  },
  1: {
    qq: {
      order: ["dolby", "ra360", "dtsx", "master", "surround", "hires", "dts", "sq", "hq", "nac", "standard"],
      enabled: ["dolby", "hires", "sq", "hq", "standard"],
    },
    netease: {
      order: ["sky", "master", "vivid", "jyeffect", "hires", "sq", "hq", "higher", "standard", "dolby"],
      enabled: ["dolby", "jyeffect", "hires", "sq", "hq", "higher", "standard"],
    },
  },
  2: {
    qq: {
      order: ["dolby", "ra360", "dtsx", "master", "surround", "hires", "dts", "sq", "hq", "nac", "standard"],
      enabled: ["dolby", "ra360", "dtsx", "hires", "sq", "hq", "standard"],
    },
  },
};

export function normalizeQualityTagPreferences(value: unknown, savedVersion: number): QualityTagPreferences {
  const saved = value && typeof value === "object" ? value as Partial<Record<Platform, unknown>> : {};
  const normalize = (platform: Platform) => {
    const defaults = defaultQualityTagPreferences[platform];
    const entries = saved[platform];
    if (!Array.isArray(entries)) return defaults;

    const remaining = new Map(defaults.map((entry) => [entry.id, entry]));
    const ordered: QualityTagPreference[] = [];
    for (const entry of entries as unknown[]) {
      if (!entry || typeof entry !== "object") continue;
      const { id, enabled } = entry as Partial<QualityTagPreference>;
      if (id == null || typeof enabled !== "boolean" || !remaining.delete(id)) continue;
      ordered.push({ id, enabled });
    }
    const previous = previousDefaults[savedVersion]?.[platform];
    if (previous && ordered.length === previous.order.length && ordered.every(
      ({ id, enabled }, index) => id === previous.order[index] && enabled === previous.enabled.includes(id),
    )) return defaults;
    return [...ordered, ...remaining.values()];
  };
  return { qq: normalize("qq"), netease: normalize("netease") };
}

export function qualityTagLabel(platform: Platform, id: TagId) {
  return tagOptions[platform].find((tag) => tag.id === id)?.label ?? id;
}

export function selectQualityTag(song: Song, preferences: QualityTagPreferences) {
  const levels = song.availableQualities;
  if (!levels?.length || song.path || song.source === "local") return;
  const platform = songPlatform(song);
  for (const { id, enabled } of preferences[platform]) {
    if (!enabled) continue;
    const tag = tagOptions[platform].find((option) => option.id === id);
    if (tag?.levels.some((level) => levels.includes(level))) return tag.label;
  }
}
