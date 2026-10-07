import { platformName, type Platform } from "@met/core";

export default function PlatformIcon({ platform }: { platform: Platform }) {
  const netease = platform === "netease";
  return (
    <span
      title={platformName(platform)}
      aria-label={platformName(platform)}
      className="inline-flex shrink-0 items-center"
    >
      <img
        src={`${import.meta.env.BASE_URL}images/icons/${netease ? "netease-music" : "qq-music"}.png`}
        alt=""
        width="18"
        height="18"
        aria-hidden="true"
        className="object-contain"
      />
    </span>
  );
}
