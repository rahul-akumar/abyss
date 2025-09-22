// Convert approximate correlated color temperature (K) to sRGB in [0,1].
// Based on common approximations; returns gamma-encoded sRGB. We'll convert to linear after.
export function kelvinToSRGB(tempK: number): { r: number; g: number; b: number } {
  const t = Math.max(1000, Math.min(40000, tempK)) / 100;

  // Red
  let r: number;
  if (t <= 66) r = 255;
  else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    r = Math.max(0, Math.min(255, r));
  }

  // Green
  let g: number;
  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }
  g = Math.max(0, Math.min(255, g));

  // Blue
  let b: number;
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    b = Math.max(0, Math.min(255, b));
  }

  return { r: r / 255, g: g / 255, b: b / 255 };
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function kelvinToLinear(tempK: number): { r: number; g: number; b: number } {
  const s = kelvinToSRGB(tempK);
  return { r: srgbToLinear(s.r), g: srgbToLinear(s.g), b: srgbToLinear(s.b) };
}
