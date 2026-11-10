type Tap = readonly [channel: number, gain: number];
export type PcmMix = readonly (readonly Tap[])[];

/** Known channel beds start with L/R/C/LFE, followed by surround pairs. */
export function bedLayouts(channels: number): number[] {
  if (![1, 2, 6, 8, 10, 12, 16].includes(channels))
    throw new Error(`音频声道数不受支持（${channels}）`);
  return [...new Set([channels, 8, 6, 2].filter((count) => count <= channels && count > 2)), 2];
}

const direct = (channel: number): Tap[] => [[channel, 1]];
const normalize = (taps: Tap[]): Tap[] => {
  const gain = taps.reduce((sum, [, weight]) => sum + weight, 0);
  return taps.map(([channel, weight]) => [channel, weight / gain]);
};

/**
 * AVS3 and the sampled QQ Vorbis beds put side surrounds before rears.
 * Eight-channel output uses the PCM/WAVE order (rear pair before side pair).
 * Larger outputs use discrete device channels and retain all extra pairs.
 */
export function bedMix(source: number, output: number, vorbis = false): PcmMix {
  if (source <= 2) return [direct(0), direct(source - 1)];
  if (source === output) {
    const order = Array.from({ length: source }, (_, channel) => channel);
    if (source === 8 || source >= 12) order.splice(4, 4, 6, 7, 4, 5);
    return order.map(direct);
  }
  if (output === 2) {
    return [0, 1].map((side) => {
      const taps: Tap[] = [[side, 1], [2, Math.SQRT1_2]];
      for (let channel = 4; channel < source; channel += 2) {
        const gain = channel < (vorbis ? 8 : 6) ? Math.SQRT1_2 : 0.5;
        taps.push([channel + side, gain]);
      }
      return normalize(taps);
    });
  }

  const hasRear = source !== 10 && source >= 8;
  const front = [direct(0), direct(1)];
  const surround = [direct(4), direct(5)];
  const rear: Tap[][] = [[], []];
  for (const side of [0, 1]) {
    if (hasRear) (output === 8 ? rear : surround)[side].push([6 + side, output === 8 ? 1 : Math.SQRT1_2]);
    // Height front folds into front, height rear and extra pairs into surround.
    const firstHeight = hasRear ? 8 : 6;
    if (firstHeight < source) front[side].push([firstHeight + side, 0.5]);
    for (let channel = firstHeight + 2; channel < source; channel += 2) {
      (output === 8 && channel === firstHeight + 2 ? rear : surround)[side].push([channel + side, 0.5]);
    }
  }
  const bed = output === 8 ? [...rear, ...surround] : surround;
  return [...front, direct(2), direct(3), ...bed].map(normalize);
}

/** Fraunhofer outputs CICP 12 as sides before rears. CICP 19 is already in device order. */
export function mpegHOutputMix(channels: number): PcmMix {
  return channels === 8
    ? [0, 1, 2, 3, 6, 7, 4, 5].map(direct)
    : Array.from({ length: channels }, (_, channel) => direct(channel));
}
