import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { platformName, type Platform } from "@met/core";
import { Button } from "@/components/ui/button";
import { qualityTagLabel, type QualityTagPreference } from "@/lib/qualityTags";
import { useSettingsStore } from "@/stores/settings";
import { SettingItem } from "./SettingItem";

const platforms = ["qq", "netease"] as const;

export function QualityTagSettings() {
  const [platform, setPlatform] = useState<Platform>("qq");
  const entries = useSettingsStore((s) => s.qualityTags[platform]);
  const update = (change: (current: QualityTagPreference[]) => QualityTagPreference[]) => {
    useSettingsStore.setState(({ qualityTags }) => ({
      qualityTags: { ...qualityTags, [platform]: change(qualityTags[platform]) },
    }));
  };
  const move = (id: QualityTagPreference["id"], step: -1 | 1) => {
    update((current) => {
      const index = current.findIndex((entry) => entry.id === id);
      const target = index + step;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const reordered = current.slice();
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  };

  return (
    <SettingItem name="歌曲列表音质标签" tip="从上往下匹配，歌曲只展示第一个已勾选且可用的音质标签。" column>
      <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="音质标签平台">
        {platforms.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={value === platform ? "primary" : "outline"}
            aria-pressed={value === platform}
            onClick={() => setPlatform(value)}
          >
            {platformName(value)}
          </Button>
        ))}
      </div>
      <ol aria-label={`${platformName(platform)}音质标签优先级`}>
        {entries.map(({ id, enabled }, index) => {
          const label = qualityTagLabel(platform, id);
          return (
            <li key={id} className="flex items-center justify-between gap-1 border-t border-[var(--met-border)] py-1">
              <label className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-[var(--met-primary)]"
                  checked={enabled}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    update((current) => current.map((entry) =>
                      entry.id === id ? { ...entry, enabled: checked } : entry,
                    ));
                  }}
                />
                <span className="min-w-0 break-words">{label}</span>
              </label>
              <div className="flex shrink-0">
                <Button size="icon" aria-label={`上移 ${label}`} disabled={index === 0} onClick={() => move(id, -1)}>
                  <ArrowUp size={16} aria-hidden="true" />
                </Button>
                <Button size="icon" aria-label={`下移 ${label}`} disabled={index === entries.length - 1} onClick={() => move(id, 1)}>
                  <ArrowDown size={16} aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
    </SettingItem>
  );
}
