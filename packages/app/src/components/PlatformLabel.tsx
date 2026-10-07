import { platformName } from "@met/core";
import { useMusicPlatform } from "@/lib/musicPlatform";
import PlatformIcon from "./PlatformIcon";
export default function PlatformLabel() {
  const platform = useMusicPlatform();
  return <div className="mb-4 flex items-center gap-2 text-xs text-[var(--met-fg-dim)]"><PlatformIcon platform={platform} />{platformName(platform)}</div>;
}
