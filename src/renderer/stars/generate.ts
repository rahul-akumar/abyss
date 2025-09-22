export type StarData = Float32Array<ArrayBuffer>; // interleaved: posX, posY, sizePx, rLin, gLin, bLin

export interface StarGenOptions {
  count: number;
  seed?: number;
  bandTiltDeg?: number; // galactic band tilt
  bandSigma?: number; // gaussian width perpendicular to band
  bandWeight?: number; // 0..1 weight of band vs uniform background
}

import { mulberry32, randNormal, randRange } from '../utils/random';
import { kelvinToLinear } from '../utils/color';

export function generateStars(opts: StarGenOptions): StarData {
  const count = Math.max(1, Math.floor(opts.count));
  const rand = mulberry32((opts.seed ?? 1337) >>> 0);

  const tilt = ((opts.bandTiltDeg ?? 12) * Math.PI) / 180;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const sigma = opts.bandSigma ?? 0.25;
  const bandW = Math.min(1, Math.max(0, opts.bandWeight ?? 0.7));

  const data: StarData = new Float32Array(new ArrayBuffer(count * 6 * 4));

  for (let i = 0; i < count; i++) {
    // Choose whether this star belongs to the band or uniform background
    const useBand = rand() < bandW;

    // Generate coordinates in band frame (u along band, v perpendicular)
    let u: number, v: number;
    if (useBand) {
      u = randRange(rand, -1.2, 1.2);
      v = randNormal(rand, 0, sigma);
    } else {
      u = randRange(rand, -1.0, 1.0);
      v = randRange(rand, -1.0, 1.0);
    }

    // Rotate from band frame to screen frame with tilt
    let x = u * cosT - v * sinT;
    let y = u * sinT + v * cosT;
    // Clamp to NDC bounds softly
    x = Math.max(-1.0, Math.min(1.0, x));
    y = Math.max(-1.0, Math.min(1.0, y));

    // Apparent brightness distribution (heavy tail for few bright stars)
    const bright = Math.pow(rand(), 4.0); // skew towards faint

    // Map to approximate magnitude size (in pixels)
    const sizePx = 0.8 + 2.5 * Math.sqrt(bright);

    // Temperature distribution (rough HR-like)
    let tempK: number;
    const r = rand();
    if (r < 0.6) tempK = clamp(randNormal(rand, 5500, 900), 3000, 9000);
    else if (r < 0.85) tempK = clamp(randNormal(rand, 4200, 600), 3000, 7000);
    else tempK = clamp(randNormal(rand, 8000, 1500), 5000, 10000);

    const col = kelvinToLinear(tempK);
    // Scale color by brightness factor (keep modest to avoid clipping)
    const intensity = 0.4 + 1.2 * bright;
    const rLin = col.r * intensity;
    const gLin = col.g * intensity;
    const bLin = col.b * intensity;

    const base = i * 6;
    data[base + 0] = x;
    data[base + 1] = y;
    data[base + 2] = sizePx;
    data[base + 3] = rLin;
    data[base + 4] = gLin;
    data[base + 5] = bLin;
  }

  return data;
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
