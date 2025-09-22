// Generates small tileable 3D volumes for nebula density and warp.
// Density: ridged multifractal - cavities blend; Warp: multi-octave vector noise in [-1,1].

export type NebulaVolumeForces = {
  size?: number; seed?: number;
  filament?: number; // 0..2 (sharper filaments)
  cavity?: number;   // 0..2 (bigger cavities)
  band?: number;     // 0..2 (denser near band)
  prewarp?: number;  // 0..0.6 (pre-warp amplitude)
  warpVec?: number;  // 0..1 (warp vector magnitude baked)
  scaleX?: number; scaleY?: number; scaleZ?: number; // anisotropic scale
  tiltDeg?: number;  // tilt angle in degrees
};

export function generateNebulaVolumes(params: NebulaVolumeForces = {}) {
  const S = (params.size ?? 64) | 0;
  const seed = params.seed ?? 1337;
  const K_FIL = params.filament ?? 1.0;
  const K_CAV = params.cavity ?? 1.0;
  const K_BAND = params.band ?? 1.0;
  const PRE_WARP = params.prewarp ?? 0.20;
  const WARP_VEC = params.warpVec ?? 0.70;
  const SX = params.scaleX ?? 1.0, SY = params.scaleY ?? 0.7, SZ = params.scaleZ ?? 1.2;
  const TILT = ((params.tiltDeg ?? 12) * Math.PI) / 180;

  const period = 16; // lattice period for tiling
  const density = new Uint8Array(S * S * S * 4); // RGBA8 (R: density, G: dust)
  const warp = new Uint8Array(S * S * S * 4);

  // PRNG
  let state = seed >>> 0;
  const rnd = () => (state = (state * 1664525 + 1013904223) >>> 0) / 0xffffffff;

  // Lattice random for periodic value noise
  const hash3 = (ix: number, iy: number, iz: number) => {
    // wrap to period
    ix = ((ix % period) + period) % period;
    iy = ((iy % period) + period) % period;
    iz = ((iz % period) + period) % period;
    let h = ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 374761;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = (h ^ (h >>> 16)) >>> 0;
    return (h & 0xffffff) / 0xffffff; // [0,1)
  };
  const smoothstep = (t: number) => t * t * (3 - 2 * t);
  const valueNoise = (x: number, y: number, z: number, freq: number) => {
    // periodic grid at freq (must divide period for perfect tiling)
    const gx = Math.floor(x * freq);
    const gy = Math.floor(y * freq);
    const gz = Math.floor(z * freq);
    const fx = x * freq - gx;
    const fy = y * freq - gy;
    const fz = z * freq - gz;
    const ux = smoothstep(fx);
    const uy = smoothstep(fy);
    const uz = smoothstep(fz);
    let n = 0;
    for (let dx = 0; dx <= 1; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        for (let dz = 0; dz <= 1; dz++) {
          const c = hash3(gx + dx, gy + dy, gz + dz);
          const wx = dx ? ux : 1 - ux;
          const wy = dy ? uy : 1 - uy;
          const wz = dz ? uz : 1 - uz;
          n += c * wx * wy * wz;
        }
      }
    }
    return n; // [0,1]
  };

  const fbm = (x: number, y: number, z: number) => {
    let f = 0, amp = 0.5, fr = 1.0;
    for (let i = 0; i < 4; i++) {
      // ensure fr divides period for strict tiling (fr: 1,2,4,8 ok)
      f += amp * valueNoise(x, y, z, fr);
      fr *= 2;
      amp *= 0.5;
    }
    return f;
  };

  const ridged = (x: number, y: number, z: number) => {
    // ridged multifractal with gain curve
    let r = 0, amp = 0.5, fr = 1.0;
    for (let i = 0; i < 6; i++) {
      const n = valueNoise(x, y, z, fr);
      const rid = 1 - Math.abs(2 * n - 1);
      r += rid * rid * amp;
      fr *= 2;
      amp *= 0.5;
    }
    // gain curve to accent filaments
    r = Math.pow(Math.min(1, Math.max(0, r)), 1.1);
    return r; // [0,1]
  };

  // Periodic Worley (cellular) noise: returns F1 and F2 distances in [0,1]
  const worleyF12 = (x: number, y: number, z: number, cells: number) => {
    const fx = x * cells, fy = y * cells, fz = z * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const px = fx - ix, py = fy - iy, pz = fz - iz;
    let d1 = 1e9, d2 = 1e9;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cx = ix + dx, cy = iy + dy, cz = iz + dz;
          // feature point inside cell (periodic wrap)
          const jx = hash3(cx, cy, cz);
          const jy = hash3(cx + 19, cy - 7, cz + 11);
          const jz = hash3(cx - 13, cy + 17, cz - 23);
          const fxp = ((cx % cells) + cells) % cells;
          const fyp = ((cy % cells) + cells) % cells;
          const fzp = ((cz % cells) + cells) % cells;
          const pxp = fxp + jx - (ix % cells);
          const pyp = fyp + jy - (iy % cells);
          const pzp = fzp + jz - (iz % cells);
          const dxp = pxp - px;
          const dyp = pyp - py;
          const dzp = pzp - pz;
          const d = Math.sqrt(dxp*dxp + dyp*dyp + dzp*dzp);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
        }
      }
    }
    // normalize distances roughly into [0,1]
    const norm = Math.sqrt(3); // max distance within a cell neighborhood
    return { f1: Math.min(1, d1 / norm), f2: Math.min(1, d2 / norm) };
  };

  const cavities = (x: number, y: number, z: number) => {
    // combine large-scale soft cavities with Worley F1
    const soft = ((): number => { let f = 0, amp = 0.6, fr = 1.0; for (let i=0;i<3;i++){ f+=amp*valueNoise(x,y,z,fr); fr*=2; amp*=0.5;} return f; })();
    const w = worleyF12(x, y, z, 8);
    const cav = 0.6 * soft + 0.4 * (1.0 - w.f1);
    return cav; // [0,1]
  };

  const idx = (x: number, y: number, z: number) => ((z * S + y) * S + x) * 4;

  // tilt matrix around Z to add anisotropy across the band
  const ct = Math.cos(TILT), st = Math.sin(TILT);

  for (let z = 0; z < S; z++) {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        // base coords in [0,1)
        const u0 = x / S, v0 = y / S, w0 = z / S;
        // apply anisotropic scaling and tilt
        const xr = u0 * SX * ct - v0 * SY * st;
        const yr = u0 * SX * st + v0 * SY * ct;
        const zr = w0 * SZ;
        // pre-warp coordinates to break uniformity
        const wpx = fbm((xr + 0.13) % 1, yr, zr);
        const wpy = fbm(xr, (yr + 0.21) % 1, zr);
        const wpz = fbm(xr, yr, (zr + 0.34) % 1);
        const xw = (xr + PRE_WARP * (wpx - 0.5) + 1) % 1;
        const yw = (yr + PRE_WARP * (wpy - 0.5) + 1) % 1;
        const zw = (zr + PRE_WARP * (wpz - 0.5) + 1) % 1;

        // Density shaping: filaments minus cavities, plus band bias
        const r = ridged(xw, yw, zw);
        const c = cavities(xw, yw, zw);
        let d = (r * (0.9 + 0.6 * (K_FIL - 1.0))) - (0.55 * K_CAV) * c + 0.10;
        // band bias (denser near midplane)
        const band = 1 - Math.abs(((yr % 1 + 1) % 1) * 2 - 1);
        d *= 0.80 + 0.55 * band * K_BAND;
        // boost and gentle gamma to raise average density
        d = Math.max(0, Math.min(1, Math.pow(d * 1.25 + 0.05, 0.90)));

        // Derive dust from cavities and inverted ridged
        let dust = Math.max(0, Math.min(1, 0.55 * c * K_CAV + 0.25 * (1 - r)));

        // Write density/dust
        const di = idx(x, y, z);
        density[di + 0] = (d * 255) & 255;
        density[di + 1] = (dust * 255) & 255;
        density[di + 2] = 0;
        density[di + 3] = 255;

        // Warp vector for runtime domain warp
        const wx = fbm((u0 + 17.23) % 1, v0, w0);
        const wy = fbm(u0, (v0 + 31.77) % 1, w0);
        const wz = fbm(u0, v0, (w0 + 23.41) % 1);
        const vx = 2 * (wx - 0.5);
        const vy = 2 * (wy - 0.5);
        const vz = 2 * (wz - 0.5);
        const scale = WARP_VEC;
        warp[di + 0] = Math.max(0, Math.min(255, Math.floor((vx * scale * 0.5 + 0.5) * 255)));
        warp[di + 1] = Math.max(0, Math.min(255, Math.floor((vy * scale * 0.5 + 0.5) * 255)));
        warp[di + 2] = Math.max(0, Math.min(255, Math.floor((vz * scale * 0.5 + 0.5) * 255)));
        warp[di + 3] = 255;
      }
    }
  }

  return { size: S, density, warp };
}
