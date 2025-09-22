export type GalaxyImpostorData = Float32Array; // interleaved per-instance: centerU, centerV, sizePx, angleRad, axisRatio, colorBias, brightness

export interface GalaxyImpostorOptions {
  count: number;
  seed?: number;
  bandSigma?: number; // spread around band center in band frame (v) — used if vRange is not provided
  uRange?: [number, number]; // band-aligned extent
  vRange?: [number, number]; // perpendicular to band; if provided, v is sampled uniformly in this range
  sizePxRange?: [number, number];
}

import { mulberry32, randNormal, randRange } from '../utils/random';

export function generateGalaxyImpostors(opts: GalaxyImpostorOptions): GalaxyImpostorData {
  const count = Math.max(0, Math.floor(opts.count));
  const rand = mulberry32((opts.seed ?? 4242) >>> 0);
  const sigma = opts.bandSigma ?? 0.2;
  const [uMin, uMax] = opts.uRange ?? [-1.2, 1.2];
  const vRange = opts.vRange; // if set, we will sample v uniformly
  const [sMin, sMax] = opts.sizePxRange ?? [14, 48];

  const data = new Float32Array(count * 7);
  for (let i = 0; i < count; i++) {
    // Position in band frame
    const u = randRange(rand, uMin, uMax);
    const v = vRange ? randRange(rand, vRange[0], vRange[1]) : randNormal(rand, 0, sigma * 0.5); // uniform across screen if vRange provided

    // Size in pixels (half-light-ish)
    const size = randRange(rand, sMin, sMax);

    // Angle (relative to band axis) and axis ratio
    // Center angles around 0 so major axes align with the band; small jitter for variation
    const angle = randNormal(rand, 0, 0.45);
    const axis = Math.max(0.5, Math.min(0.9, randRange(rand, 0.5, 0.9)));

    // Color bias and brightness
    const colorBias = randRange(rand, 0.2, 0.9); // 0: blue, 1: yellow
    const brightness = randRange(rand, 0.25, 0.8);

    const base = i * 7;
    data[base + 0] = u;
    data[base + 1] = v;
    data[base + 2] = size;
    data[base + 3] = angle;
    data[base + 4] = axis;
    data[base + 5] = colorBias;
    data[base + 6] = brightness;
  }
  return data;
}
