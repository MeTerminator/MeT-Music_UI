import { useEffect, useState } from "react";
import { Menu } from "@base-ui-components/react/menu";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronUp, Loader2 } from "lucide-react";
import {
  api,
  playbackLevel,
  qqQualities,
  qqPlaybackQualities,
  songIdentityKey,
  songPlatform,
  switchPlaybackQuality,
} from "@met/core";
import { useMusicStore } from "@/stores/music";
import { useStatusStore } from "@/stores/status";
import { useSettingsStore } from "@/stores/settings";
import { supportedQQCodecs } from "@/player/qq-codecs";
import { menuPopupClassName } from "@/components/ui/menu";

const neteaseLabels: Record<string, string> = {
  standard: "标准",
  higher: "较高",
  exhigh: "极高",
  lossless: "无损",
  hires: "Hi-Res",
  jyeffect: "高清臻音",
  dolby: "杜比全景声",
  vivid: "臻音全景声",
  jymaster: "超清母带",
  sky: "沉浸环绕声",
};
const shortLabels: Record<string, string> = {
  WEB: "标准",
  HQ: "HQ",
  SQ: "无损",
  RS: "Hi-Res",
  QAI: "母带",
  Q360V1: "全景声",
  Q360V2: "全景声5.1",
  NAC: "NAC",
};
const qualityLabel = (level: string, platform: "qq" | "netease") =>
  platform === "qq"
    ? (qqQualities.find((q) => q.key === level.toUpperCase())?.label ?? level)
    : (neteaseLabels[level.toLowerCase()] ?? level);

export default function QualityMenu({
  overlay = false,
  onOpenChange,
}: {
  overlay?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  // Also subscribe to FM's current song; getPlaySongData applies the existing mode semantics.
  const regularSong = useMusicStore((s) => s.playSongData);
  const fmSong = useMusicStore((s) => s.privateFmSong);
  const mode = useStatusStore((s) => s.playMode);
  const rawQuality = useStatusStore((s) => s.playbackQuality);
  const loading = useStatusStore((s) => s.playLoading);
  const expectedQQ = useSettingsStore((s) => s.songLevel);
  const expectedNetease = useSettingsStore((s) => s.neteaseSongLevel);
  const song = mode === "fm" && fmSong ? fmSong : regularSong;
  const key = songIdentityKey(song);
  const platform = songPlatform(song);
  const quality = rawQuality?.songKey === key ? rawQuality : null;
  const [open, setOpen] = useState(false);
  const eligible =
    Boolean(song.id) &&
    !song.path &&
    !song.pc &&
    song.source !== "local" &&
    mode !== "dj";
  const expected = playbackLevel(
    { songLevel: expectedQQ, neteaseSongLevel: expectedNetease },
    platform,
  );
  const normalize = (level: string) =>
    platform === "qq" ? level.toUpperCase() : level.toLowerCase();
  const actual = quality?.actualLevel ? normalize(quality.actualLevel) : null;
  const desired = normalize(expected);
  const info = useQuery({
    queryKey: ["playback-quality", platform, key],
    queryFn: () => api.getMusicInfo(song.id, platform),
    enabled: open && eligible && quality?.availableLevels == null,
    staleTime: 60_000,
  });
  const available =
    quality?.availableLevels ??
    info.data?.[String(song.id)]?.track_info.available_qualities ??
    null;
  const codecs = supportedQQCodecs();
  const playable =
    platform === "qq"
      ? new Set<string>(qqPlaybackQualities(codecs).map((q) => q.key))
      : new Set(
          ["standard", "higher", "exhigh", "lossless", "hires"].filter(
            (level) =>
              codecs.includes(
                ["lossless", "hires"].includes(level) ? "flac" : "mp3",
              ),
          ),
        );
  const choices = (available ?? [])
    .map(normalize)
    .filter((level) => playable.has(level));
  const levels = [
    ...new Set([...choices, ...(actual ? [actual] : []), desired]),
  ];
  const switching = quality?.switching ?? false;
  const disabled = !eligible || !quality || loading || switching;
  const display = !eligible
    ? song.path || song.source === "local"
      ? "本地"
      : song.pc
        ? "云盘"
        : "音质"
    : actual
      ? platform === "qq"
        ? (shortLabels[actual] ?? qualityLabel(actual, platform))
        : qualityLabel(actual, platform)
      : "音质";

  useEffect(() => {
    setOpen(false);
  }, [key]);
  useEffect(() => {
    onOpenChange?.(open);
    return () => {
      if (open) onOpenChange?.(false);
    };
  }, [open, onOpenChange]);

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        data-testid={
          overlay ? "quality-trigger-overlay" : "quality-trigger-bar"
        }
        aria-label={`播放音质：${actual ? qualityLabel(actual, platform) : display}`}
        title={
          actual ? `当前播放：${qualityLabel(actual, platform)}` : "播放音质"
        }
        disabled={!eligible}
        className={`flex h-8 max-w-28 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors disabled:cursor-default disabled:opacity-50 ${
          overlay
            ? "border-white/20 bg-white/5 text-white/85 hover:bg-white/10"
            : "border-[var(--met-border)] bg-transparent text-[var(--met-fg-dim)] hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-fg)]"
        }`}
      >
        {switching ? (
          <Loader2
            size={12}
            className="shrink-0 animate-spin"
            aria-hidden="true"
          />
        ) : null}
        <span className="truncate">{display}</span>
        <ChevronUp
          size={11}
          className="shrink-0 opacity-60"
          aria-hidden="true"
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="top"
          align="end"
          sideOffset={10}
          className="z-[80] outline-none"
        >
          <Menu.Popup
            className={`${menuPopupClassName} w-72 overflow-hidden`}
            aria-label="当前歌曲音质"
          >
            <div className="border-b border-[var(--met-border)] px-3 py-2.5">
              <div className="text-sm font-medium text-[var(--met-fg)]">
                播放音质
              </div>
              <p className="mt-0.5 truncate text-xs text-[var(--met-fg-dim)]">
                {song.name}
              </p>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {levels.map((level) => {
                const current = level === actual;
                const preferred = level === desired;
                const supported = choices.includes(level);
                return (
                  <Menu.Item
                    key={level}
                    disabled={disabled || !supported || current}
                    onClick={() => {
                      void switchPlaybackQuality(level);
                    }}
                    className="flex min-h-10 cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--met-fg)] outline-none data-[disabled]:cursor-default data-[highlighted]:bg-[var(--met-bg-hover)]"
                    aria-label={`${qualityLabel(level, platform)}${current ? "，当前使用" : ""}${preferred ? "，设置期望" : ""}${!supported ? "，暂不可选" : ""}`}
                  >
                    <Check
                      size={14}
                      className={`shrink-0 ${current ? "text-[var(--met-primary)]" : "invisible"}`}
                      aria-hidden="true"
                    />
                    <span
                      className={`min-w-0 flex-1 ${!supported ? "opacity-50" : ""}`}
                    >
                      {qualityLabel(level, platform)}
                    </span>
                    <span className="flex shrink-0 gap-1 text-[10px]">
                      {!supported && !current ? (
                        <span className="py-0.5 text-[var(--met-fg-dim)]">
                          不可选
                        </span>
                      ) : null}
                      {current ? (
                        <span className="rounded bg-[var(--met-primary)]/10 px-1.5 py-0.5 text-[var(--met-primary)]">
                          当前使用
                        </span>
                      ) : null}
                      {preferred ? (
                        <span className="rounded bg-[var(--met-bg-hover)] px-1.5 py-0.5 text-[var(--met-fg-dim)]">
                          设置期望
                        </span>
                      ) : null}
                    </span>
                  </Menu.Item>
                );
              })}
            </div>
            {available == null ? (
              <p
                role="status"
                className="px-3 py-2 text-xs text-[var(--met-fg-dim)]"
              >
                {info.isFetching
                  ? "正在读取可选音质…"
                  : "暂未获取到可选音质信息"}
              </p>
            ) : null}
            <div className="border-t border-[var(--met-border)] px-3 py-2 text-[11px] leading-5 text-[var(--met-fg-dim)]">
              仅对本次当前歌曲生效，切歌后恢复设置
              {quality?.overrideLevel ? (
                <div>
                  本次选择：{qualityLabel(quality.overrideLevel, platform)}
                </div>
              ) : null}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
