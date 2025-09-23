import { WebGPUEngine } from './webgpu';
import { WebGL2Engine } from './webgl2';

export type Quality = 'auto' | 'low' | 'medium' | 'high';
export type Preset = 'glass' | 'blackhole';

export interface EngineOptions {
  reduceMotion?: boolean;
}

export interface IRenderer {
  start(): void;
  stop(): void;
  resize(width?: number, height?: number, dpr?: number): void;
  setPreset(preset: Preset): void;
  setQuality(quality: Quality): void;
  setReduceMotion(reduce: boolean): void;
  setExposure(ev: number): void;
  // Stars
  setStarCount(count: number): void;
  setStarIntensity(intensity: number): void;
  setTwinkleSpeed(speed: number): void;
  setTwinkleAmount(amount: number): void;
  // Nebula
  setNebulaParams(density: number, g: number): void;
  setNebulaVibrancy(vibrancy: number): void;
  setNebulaFlowSpeed(speed: number): void;
  setNebulaFlowAmp(amp: number): void;
  setNebulaSwirl(swirl: number): void;
  setNebulaDriftX(driftX: number): void;
  // Aurora
  setAuroraEnabled?(enabled: boolean): void;
  setAuroraParams?(amplitude: number, blend: number, speed: number): void;
  setAuroraStops?(stops: [number, number, number][]): void;
  setAuroraStrength?(strength: number): void;
  // Lens
  setLensParams(radiusPx: number, zoom: number, dispersion: number): void;
  setLensCenter(cx: number, cy: number): void;
  // Black hole
  setBHParams(mass: number, spin: number): void;
  setBlackHoleEnabled?(enabled: boolean): void;
  setBHStreaks?(strength: number, lengthPx: number): void;
  setBHAccretionSpeed?(speed: number): void;
  // Lens effects (glass mode)
  setLensBloom(strength: number, threshold: number, radiusPx: number): void;
  setLensStreaks(strength: number, lengthPx: number, angleDeg: number): void;
  // Stars interactions (optional)
  setStarCursor?(xPx: number, yPx: number): void;
  setStarForce?(radiusPx: number, strengthPx: number): void;
  triggerStarShockwave?(xPx: number, yPx: number, ampPx?: number, speedPx?: number, widthPx?: number, damp?: number): void;
  // Visibility toggles
  setShowStars(show: boolean): void;
  setShowGalaxy(show: boolean): void;
  setShowNebula(show: boolean): void;
  setLensEnabled(enabled: boolean): void;
  // Shooting stars
  setShootingStarsEnabled(enabled: boolean): void;
  setShootingStarsParams(ratePerMin: number, speedPx: number, lengthPx: number, widthPx: number, brightness: number): void;
}

export class Engine implements IRenderer {
  private canvas: HTMLCanvasElement;
  private backend: IRenderer;

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions = {}) {
    this.canvas = canvas;

    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
    if (hasWebGPU) {
      this.backend = new WebGPUEngine(canvas, opts);
    } else {
      this.backend = new WebGL2Engine(canvas, opts);
    }
  }

  start() { this.backend.start(); }
  stop() { this.backend.stop(); }
  resize(w?: number, h?: number, dpr?: number) { this.backend.resize(w, h, dpr); }
  setPreset(preset: Preset) { this.backend.setPreset(preset); }
  setNebulaParams(density: number, g: number) { this.backend.setNebulaParams(density, g); }
  setNebulaVibrancy(vibrancy: number) { this.backend.setNebulaVibrancy(vibrancy); }
  setNebulaFlowSpeed(speed: number) { this.backend.setNebulaFlowSpeed(speed); }
  setNebulaFlowAmp(amp: number) { this.backend.setNebulaFlowAmp(amp); }
  setNebulaSwirl(swirl: number) { this.backend.setNebulaSwirl(swirl); }
  setNebulaDriftX(driftX: number) { this.backend.setNebulaDriftX(driftX); }
  setQuality(quality: Quality) { this.backend.setQuality(quality); }
  setReduceMotion(reduce: boolean) { this.backend.setReduceMotion(reduce); }
  setExposure(ev: number) { this.backend.setExposure(ev); }
  setStarCount(count: number) { (this.backend as any).setStarCount?.(count); }
  setStarIntensity(intensity: number) { (this.backend as any).setStarIntensity?.(intensity); }
  setTwinkleSpeed(speed: number) { (this.backend as any).setTwinkleSpeed?.(speed); }
  setTwinkleAmount(amount: number) { (this.backend as any).setTwinkleAmount?.(amount); }
  setLensParams(radiusPx: number, zoom: number, dispersion: number) { this.backend.setLensParams(radiusPx, zoom, dispersion); }
  setLensCenter(cx: number, cy: number) { this.backend.setLensCenter(cx, cy); }
  setBHParams(mass: number, spin: number) { this.backend.setBHParams(mass, spin); }
  setBlackHoleEnabled(enabled: boolean) { (this.backend as any).setBlackHoleEnabled?.(enabled); }
  setBHStreaks(strength: number, lengthPx: number) { (this.backend as any).setBHStreaks?.(strength, lengthPx); }
  setBHAccretionSpeed(speed: number) { (this.backend as any).setBHAccretionSpeed?.(speed); }
  // Aurora pass-through
  setAuroraEnabled(enabled: boolean) { (this.backend as any).setAuroraEnabled?.(enabled); }
  setAuroraParams(amplitude: number, blend: number, speed: number) { (this.backend as any).setAuroraParams?.(amplitude, blend, speed); }
  setAuroraStops(stops: [number, number, number][]) { (this.backend as any).setAuroraStops?.(stops); }
  setAuroraStrength(strength: number) { (this.backend as any).setAuroraStrength?.(strength); }
  setLensBloom(strength: number, threshold: number, radiusPx: number) { (this.backend as any).setLensBloom?.(strength, threshold, radiusPx); }
  setLensStreaks(strength: number, lengthPx: number, angleDeg: number) { (this.backend as any).setLensStreaks?.(strength, lengthPx, angleDeg); }
  // Stars interactions passthrough (optional)
  setStarCursor(xPx: number, yPx: number) { (this.backend as any).setStarCursor?.(xPx, yPx); }
  setStarForce(radiusPx: number, strengthPx: number) { (this.backend as any).setStarForce?.(radiusPx, strengthPx); }
  triggerStarShockwave(xPx: number, yPx: number, ampPx?: number, speedPx?: number, widthPx?: number, damp?: number) { (this.backend as any).triggerStarShockwave?.(xPx, yPx, ampPx, speedPx, widthPx, damp); }
  setShowStars(show: boolean) { (this.backend as any).setShowStars?.(show); }
  setShowGalaxy(show: boolean) { (this.backend as any).setShowGalaxy?.(show); }
  setShowNebula(show: boolean) { (this.backend as any).setShowNebula?.(show); }
  setLensEnabled(enabled: boolean) { (this.backend as any).setLensEnabled?.(enabled); }
  setShootingStarsEnabled(enabled: boolean) { (this.backend as any).setShootingStarsEnabled?.(enabled); }
  setShootingStarsParams(ratePerMin: number, speedPx: number, lengthPx: number, widthPx: number, brightness: number) { (this.backend as any).setShootingStarsParams?.(ratePerMin, speedPx, lengthPx, widthPx, brightness); }
}
