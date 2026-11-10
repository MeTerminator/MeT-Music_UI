/** Prefer the multichannel ABI. Older deployments can still use their stereo builds. */
export const spatialAssets = {
  mpegh: ["mpegh-v2", "mpegh"],
  av3a: ["av3a-v2", "av3a"],
  dtsx: ["dtsx-v3", "dtsx-v2"],
} as const;
