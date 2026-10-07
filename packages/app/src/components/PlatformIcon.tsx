import { platformName, type Platform } from "@met/core";

export default function PlatformIcon({ platform }: { platform: Platform }) {
  const netease = platform === "netease";
  return (
    <span
      title={platformName(platform)}
      aria-label={platformName(platform)}
      className="inline-flex shrink-0 items-center"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke={netease ? "#e5484d" : "#31c27c"}
        strokeWidth="2"
      >
        {netease ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M14 5v9a3 3 0 1 1-3-3h3M14 5l4 2" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="9" fill="#31c27c" stroke="none" />
            <path d="M15 6v9M15 6l3 2" stroke="white" />
            <ellipse cx="12" cy="15.5" rx="3" ry="2.5" fill="#ffe173" stroke="none" />
          </>
        )}
      </svg>
    </span>
  );
}
