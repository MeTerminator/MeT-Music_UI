export function isAppleMobileBrowser(): boolean {
  const { userAgent, platform, maxTouchPoints } = navigator;
  // iPadOS can report a desktop Mac user agent.
  return /\b(?:iPhone|iPad|iPod)\b/.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
}
