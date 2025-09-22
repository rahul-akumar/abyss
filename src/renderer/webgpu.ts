import type { IRenderer, Preset, Quality } from './index';
import { WebGPUStarPass } from './stars/webgpuStarPass';
import { WebGPUGalaxyPass } from './galaxy/webgpuGalaxyPass';
import { WebGPUCompositePass } from './composite/webgpuCompositePass';
import { WebGPUNebulaPass } from './nebula/webgpuNebulaPass';
import { WebGPULensPass } from './lens/webgpuLensPass';
import { WebGPUMeteorPass } from './meteors/webgpuMeteorPass';
import { WebGPUBlackHolePass } from './blackhole/webgpuBlackHolePass';
import { WebGPUAuroraPass } from './aurora/webgpuAuroraPass';

export class WebGPUEngine implements IRenderer {
  private canvas: HTMLCanvasElement;
  private ctx?: GPUCanvasContext;
  private device?: GPUDevice;
  private format?: GPUTextureFormat;
  private rafId: number | null = null;
  private reduceMotion = false;
  private preset: Preset = 'glass';
  private quality: Quality = 'auto';
  private exposureEV = 0;
  private stars?: WebGPUStarPass;
  private galaxy?: WebGPUGalaxyPass;
  private composite?: WebGPUCompositePass;
  private rtStars?: GPUTexture;
  private rtGalaxy?: GPUTexture; // combined (band + impostors) for non-BH paths
  private rtGalaxyBand?: GPUTexture; // band only
  private rtGalaxyImp?: GPUTexture; // impostors only
  private rtNebula?: GPUTexture;
  private rtBH?: GPUTexture;
  private nebula?: WebGPUNebulaPass;
  private texDensity3D?: GPUTexture;
  private texWarp3D?: GPUTexture;
  private lens?: WebGPULensPass;
  private meteors?: WebGPUMeteorPass;
  private bh?: WebGPUBlackHolePass;
  private blackView?: GPUTextureView;
  // Aurora
  private aurora?: WebGPUAuroraPass;
  private showAurora = false;
  private auroraAmplitude = 1.0;
  private auroraBlend = 0.5;
  private auroraSpeed = 1.0;
  private auroraStops: [number, number, number][] = [
    [0.3215686275, 0.1529411765, 1.0],
    [0.4862745098, 1.0, 0.4039215686],
    [0.3215686275, 0.1529411765, 1.0],
  ];
  private auroraStrength = 1.0;
  private t0: number = performance.now();
  private lastT: number = 0;
  private nebulaDensity: number = 0.5;
  private nebulaG: number = 0.2;
  private nebulaVibrancy: number = 1.0;
  private nebulaFlowSpeed: number = 0.38;
  private nebulaFlowAmp: number = 0.14;
  private nebulaSwirl: number = 1.6;
  private nebulaDriftX: number = 0.03;
  private nebulaDriftY: number = 0.00;
  private nebulaWarpSpeed: number = 0.12;
  // Forces (generator + sampling controls)
  private volFilament = 1.0; private volCavity = 1.0; private volBand = 1.0; private volPrewarp = 0.20; private volWarpVec = 0.70;
  private volScaleX = 0.23/0.23; private volScaleY = 0.17/0.23; private volScaleZ = 0.26/0.23; // relative; sampling uses absolute below
  private sampScaleX = 0.23; private sampScaleY = 0.17; private sampScaleZ = 0.26; private volTiltDeg = 12; private volSeed = 1337;
  private starCount: number = 30000;
  private starIntensity: number = 1.0;
  private twinkleSpeed: number = 0.12; // slow default
  private twinkleAmount: number = 0.25; // subtle by default
  private lensRadiusPx = 200; private lensZoom = 1.25; private lensDispersion = 0.35;
  private lensCenterX = 0.5; private lensCenterY = 0.5;
  private lensMode: 'glass' | 'blackhole' = 'glass';
  private bhMass = 1.0; private bhSpin = 0.7;
  private bloomStrength = 0.6; private bloomThreshold = 0.7; private bloomRadiusPx = 8;
  private streakStrength = 0.8; private streakLengthPx = 120; private streakAngleDeg = 0;
  private showStars = true; private showGalaxy = true; private showNebula = true; private lensEnabled = true;
  private shootingEnabled = true; private shootingRatePerMin = 8; private shootingSpeedPx = 500; private shootingLengthPx = 180; private shootingWidthPx = 2; private shootingBrightness = 1.5;
  private bhEnabled = false;

  constructor(canvas: HTMLCanvasElement, opts: { reduceMotion?: boolean } = {}) {
    this.canvas = canvas;
    this.reduceMotion = !!opts.reduceMotion;
  }

  setPreset(preset: Preset) { this.preset = preset; }
  setQuality(quality: Quality) { this.quality = quality; }
  setReduceMotion(reduce: boolean) { this.reduceMotion = reduce; }
  setExposure(ev: number) { this.exposureEV = ev; if (this.stars) this.stars.setExposure(ev); }
  setStarCount(count: number) { this.starCount = Math.max(1000, Math.floor(count)); if (this.stars) this.stars.setStarCount(this.starCount); }
  setStarIntensity(intensity: number) { this.starIntensity = Math.max(0.0, intensity); if (this.stars) this.stars.setStarIntensity(this.starIntensity); }
  setTwinkleSpeed(speed: number) { this.twinkleSpeed = Math.max(0, speed); if (this.stars) (this.stars as any).setTwinkleSpeed?.(this.twinkleSpeed); }
  setTwinkleAmount(amount: number) { this.twinkleAmount = Math.max(0, Math.min(1, amount)); if (this.stars) (this.stars as any).setTwinkleAmount?.(this.twinkleAmount); }
  setNebulaParams(density: number, g: number) { this.nebulaDensity = density; this.nebulaG = g; if (this.nebula) this.nebula.setParams(density, g); }
  setNebulaVibrancy(v: number) { this.nebulaVibrancy = Math.max(0, Math.min(1, v)); if (this.nebula) (this.nebula as any).setVibrancy?.(this.nebulaVibrancy); }
  setNebulaFlow(flowSpeed: number, flowAmp: number, swirl: number, driftX: number, driftY: number, warpSpeed: number) {
    this.nebulaFlowSpeed = flowSpeed; this.nebulaFlowAmp = flowAmp; this.nebulaSwirl = swirl; this.nebulaDriftX = driftX; this.nebulaDriftY = driftY; this.nebulaWarpSpeed = warpSpeed;
    if (this.nebula) (this.nebula as any).setFlowParams?.(flowSpeed, flowAmp, swirl, driftX, driftY, warpSpeed);
  }
  setNebulaForces(forces: { filament?: number; cavity?: number; band?: number; prewarp?: number; warpVec?: number; scaleX?: number; scaleY?: number; scaleZ?: number; tiltDeg?: number; seed?: number }) {
    this.volFilament = forces.filament ?? this.volFilament;
    this.volCavity = forces.cavity ?? this.volCavity;
    this.volBand = forces.band ?? this.volBand;
    this.volPrewarp = forces.prewarp ?? this.volPrewarp;
    this.volWarpVec = forces.warpVec ?? this.volWarpVec;
    this.sampScaleX = forces.scaleX ?? this.sampScaleX;
    this.sampScaleY = forces.scaleY ?? this.sampScaleY;
    this.sampScaleZ = forces.scaleZ ?? this.sampScaleZ;
    this.volTiltDeg = forces.tiltDeg ?? this.volTiltDeg;
    this.volSeed = forces.seed ?? this.volSeed;
    // Regenerate volumes and upload
    if (this.device && this.texDensity3D && this.texWarp3D) {
      const { size: VS, density: volD, warp: volW } = generateNebulaVolumes({ size: 64, seed: this.volSeed, filament: this.volFilament, cavity: this.volCavity, band: this.volBand, prewarp: this.volPrewarp, warpVec: this.volWarpVec, tiltDeg: this.volTiltDeg, scaleX: 1.0, scaleY: 0.7, scaleZ: 1.2 });
      const bytesPerRow = VS * 4, rowsPerImage = VS;
      this.device.queue.writeTexture({ texture: this.texDensity3D }, volD, { bytesPerRow, rowsPerImage }, { width: VS, height: VS, depthOrArrayLayers: VS });
      this.device.queue.writeTexture({ texture: this.texWarp3D }, volW, { bytesPerRow, rowsPerImage }, { width: VS, height: VS, depthOrArrayLayers: VS });
      // Update sampling scale uniform
      if (this.nebula) (this.nebula as any).setNoiseScale?.(this.sampScaleX, this.sampScaleY, this.sampScaleZ);
    }
  }
  setLensParams(radiusPx: number, zoom: number, dispersion: number) {
    this.lensRadiusPx = radiusPx; this.lensZoom = zoom; this.lensDispersion = dispersion;
    if (this.lens) this.lens.setParams(radiusPx, zoom, dispersion);
    // Clamp current center based on new radius and viewport
    const w = Math.max(1, this.canvas.width), h = Math.max(1, this.canvas.height);
    const rx = Math.min(0.5, this.lensRadiusPx / w);
    const ry = Math.min(0.5, this.lensRadiusPx / h);
    const cx = Math.min(1 - rx, Math.max(rx, this.lensCenterX));
    const cy = Math.min(1 - ry, Math.max(ry, this.lensCenterY));
    this.lensCenterX = cx; this.lensCenterY = cy;
    if (this.lens) this.lens.setCenter(cx, cy);
  }
  setLensCenter(cx: number, cy: number) {
    const w = Math.max(1, this.canvas.width), h = Math.max(1, this.canvas.height);
    const rx = Math.min(0.5, this.lensRadiusPx / w);
    const ry = Math.min(0.5, this.lensRadiusPx / h);
    const clampedX = Math.min(1 - rx, Math.max(rx, cx));
    const clampedY = Math.min(1 - ry, Math.max(ry, cy));
    this.lensCenterX = clampedX; this.lensCenterY = clampedY;
    if (this.lens) this.lens.setCenter(clampedX, clampedY);
  }
  setLensMode(mode: 'glass'|'blackhole') { this.lensMode = mode; /* lens mode no longer controls black hole */ if (this.lens) this.lens.setMode('glass'); }
  setBHParams(mass: number, spin: number) { this.bhMass = mass; this.bhSpin = spin; if (this.bh) (this.bh as any).setParams?.(mass, spin); }
  setBlackHoleEnabled(enabled: boolean) { this.bhEnabled = enabled; }
  setLensBloom(strength: number, threshold: number, radiusPx: number) { this.bloomStrength = strength; this.bloomThreshold = threshold; this.bloomRadiusPx = radiusPx; if (this.lens) this.lens.setEffects(this.bloomStrength, this.bloomThreshold, this.bloomRadiusPx, this.streakStrength, this.streakLengthPx, this.streakAngleDeg); }
  setLensStreaks(strength: number, lengthPx: number, angleDeg: number) { this.streakStrength = strength; this.streakLengthPx = lengthPx; this.streakAngleDeg = angleDeg; if (this.lens) this.lens.setEffects(this.bloomStrength, this.bloomThreshold, this.bloomRadiusPx, this.streakStrength, this.streakLengthPx, this.streakAngleDeg); }
  setShowStars(show: boolean) { this.showStars = show; }
  setShowGalaxy(show: boolean) { this.showGalaxy = show; }
  setShowNebula(show: boolean) { this.showNebula = show; }
  setLensEnabled(enabled: boolean) { this.lensEnabled = enabled; }
  setShootingStarsEnabled(enabled: boolean) { this.shootingEnabled = enabled; if (this.meteors) this.meteors.setConfig({ enabled }); }
  setShootingStarsParams(ratePerMin: number, speedPx: number, lengthPx: number, widthPx: number, brightness: number) {
    this.shootingRatePerMin = ratePerMin; this.shootingSpeedPx = speedPx; this.shootingLengthPx = lengthPx; this.shootingWidthPx = widthPx; this.shootingBrightness = brightness;
    if (this.meteors) this.meteors.setConfig({ ratePerMin, speedPx, lengthPx, widthPx, brightness });
  }
  // Aurora API
  setAuroraEnabled(enabled: boolean) { this.showAurora = enabled; }
  setAuroraParams(amplitude: number, blend: number, speed: number) {
    this.auroraAmplitude = amplitude; this.auroraBlend = blend; this.auroraSpeed = speed;
    if (this.aurora) this.aurora.setParams(this.auroraAmplitude, this.auroraBlend, this.auroraSpeed);
  }
  setAuroraStops(stops: [number, number, number][]) { this.auroraStops = stops; if (this.aurora) this.aurora.setStops(this.auroraStops); }
  setAuroraStrength(strength: number) { this.auroraStrength = Math.max(0, strength); (this.aurora as any)?.setStrength?.(this.auroraStrength); }

  async start() {
    if (!('gpu' in navigator)) {
      throw new Error('WebGPU not supported');
    }

    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter');
    const device = await adapter.requestDevice();

    const ctx = this.canvas.getContext('webgpu') as unknown as GPUCanvasContext | null;
    if (!ctx) throw new Error('No WebGPU canvas context');

    const format = (navigator as any).gpu.getPreferredCanvasFormat() as GPUTextureFormat;

    this.device = device;
    this.ctx = ctx;
    this.format = format;

    this.resize();

    // Offscreen render targets for stars and galaxy
    this.rtStars = this.createTargetTexture(this.canvas.width, this.canvas.height, format);
    // Galaxy: keep a combined RT for non-BH, plus separate band and impostors for BH
    this.rtGalaxy = this.createTargetTexture(this.canvas.width, this.canvas.height, format);
    this.rtGalaxyBand = this.createTargetTexture(this.canvas.width, this.canvas.height, format);
    this.rtGalaxyImp = this.createTargetTexture(this.canvas.width, this.canvas.height, format);
    this.rtNebula = this.createTargetTexture(Math.max(1, Math.floor(this.canvas.width / 2)), Math.max(1, Math.floor(this.canvas.height / 2)), format);
    this.rtBH = this.createTargetTexture(this.canvas.width, this.canvas.height, format);
    // 1x1 black view for convenience where a second background texture is unused
    const blackTex = device.createTexture({ size: { width: 1, height: 1 }, format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: blackTex }, new Uint8Array([0,0,0,255]), { bytesPerRow: 4 }, { width: 1, height: 1 });
    this.blackView = blackTex.createView();

    // Create passes
    this.stars = new WebGPUStarPass(device, format, this.starCount);
    this.stars.setExposure(this.exposureEV);
    this.stars.setStarIntensity(this.starIntensity);
    this.stars.setViewport(this.canvas.width, this.canvas.height);
    (this.stars as any).setTwinkleSpeed?.(this.twinkleSpeed);
    (this.stars as any).setTwinkleAmount?.(this.twinkleAmount);

    this.galaxy = new WebGPUGalaxyPass(device, format);
    this.galaxy.setViewport(this.canvas.width, this.canvas.height);
    this.galaxy.setTiltDeg(12);

    this.composite = new WebGPUCompositePass(device, format);
    // Select initial background based on BH enabled state
    if (this.bhEnabled) {
      this.composite.setInputs(this.rtBH.createView(), this.blackView!, this.rtNebula.createView());
    } else {
      this.composite.setInputs(this.rtStars.createView(), this.rtGalaxy.createView(), this.rtNebula.createView());
    }

    this.nebula = new WebGPUNebulaPass(device, format);
    this.nebula.setViewport(this.rtNebula.width, this.rtNebula.height);

    // Aurora overlay uses the same half-res RT as nebula
    this.aurora = new WebGPUAuroraPass(device, format);
    this.aurora.setViewport(this.rtNebula.width, this.rtNebula.height);
    this.aurora.setParams(this.auroraAmplitude, this.auroraBlend, this.auroraSpeed);
    this.aurora.setStrength(this.auroraStrength ?? 1.0);
    this.aurora.setStops(this.auroraStops);
    this.nebula.setParams(this.nebulaDensity, this.nebulaG);
    (this.nebula as any).setVibrancy?.(this.nebulaVibrancy);
    (this.nebula as any).setFlowParams?.(this.nebulaFlowSpeed, this.nebulaFlowAmp, this.nebulaSwirl, this.nebulaDriftX, this.nebulaDriftY, this.nebulaWarpSpeed);
    (this.nebula as any).setNoiseScale?.(this.sampScaleX, this.sampScaleY, this.sampScaleZ);

    // Create a small 2D noise texture for simple nebula
    const N = 256;
    const buf = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const v = Math.floor(Math.random() * 255);
      buf[i * 4 + 0] = v; buf[i * 4 + 1] = v; buf[i * 4 + 2] = v; buf[i * 4 + 3] = 255;
    }
    const texNoise2D = device.createTexture({ size: { width: N, height: N }, format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: texNoise2D }, buf, { bytesPerRow: N * 4 }, { width: N, height: N });
    (this.nebula as any).setNoise?.(texNoise2D.createView());

    this.lens = new WebGPULensPass(device, format);
    // Lens samples background: BH-lensed when BH enabled, raw stars+galaxy otherwise
    if (this.bhEnabled) {
      this.lens.setInputs(this.rtBH.createView(), this.blackView!);
    } else {
      this.lens.setInputs(this.rtStars.createView(), this.rtGalaxy.createView());
    }
    this.lens.setViewport(this.canvas.width, this.canvas.height);
    this.lens.setParams(this.lensRadiusPx, this.lensZoom, this.lensDispersion);
    this.lens.setCenter(this.lensCenterX, this.lensCenterY);
    this.lens.setEffects(this.bloomStrength, this.bloomThreshold, this.bloomRadiusPx, this.streakStrength, this.streakLengthPx, this.streakAngleDeg);

    this.bh = new WebGPUBlackHolePass(device, format);
    this.bh.setInputs(this.rtStars.createView(), this.rtGalaxyImp.createView(), this.rtGalaxyBand.createView());
    this.bh.setViewport(this.canvas.width, this.canvas.height);
    this.bh.setParams(this.bhMass, this.bhSpin);

    this.meteors = new WebGPUMeteorPass(device, format);
    this.meteors.setViewport(this.canvas.width, this.canvas.height);
    this.meteors.setConfig({ enabled: this.shootingEnabled, ratePerMin: this.shootingRatePerMin, speedPx: this.shootingSpeedPx, lengthPx: this.shootingLengthPx, widthPx: this.shootingWidthPx, brightness: this.shootingBrightness });

    this.loop();
  }

  stop() {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  resize(width?: number, height?: number, dpr?: number) {
    const w = Math.max(1, Math.floor((width ?? this.canvas.clientWidth ?? 1)));
    const h = Math.max(1, Math.floor((height ?? this.canvas.clientHeight ?? 1)));
    const ratio = dpr ?? (globalThis.devicePixelRatio ?? 1);
    this.canvas.width = Math.floor(w * ratio);
    this.canvas.height = Math.floor(h * ratio);

    if (this.ctx && this.device && this.format) {
      this.ctx.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });

      // Recreate RTs
      this.rtStars = this.createTargetTexture(this.canvas.width, this.canvas.height, this.format);
      this.rtGalaxy = this.createTargetTexture(this.canvas.width, this.canvas.height, this.format);
      this.rtGalaxyBand = this.createTargetTexture(this.canvas.width, this.canvas.height, this.format);
      this.rtGalaxyImp = this.createTargetTexture(this.canvas.width, this.canvas.height, this.format);
      this.rtNebula = this.createTargetTexture(Math.max(1, Math.floor(this.canvas.width / 2)), Math.max(1, Math.floor(this.canvas.height / 2)), this.format);
      this.rtBH = this.createTargetTexture(this.canvas.width, this.canvas.height, this.format);
      if (this.composite && this.rtNebula) {
        if (this.bhEnabled && this.rtBH) {
          this.composite.setInputs(this.rtBH.createView(), this.blackView!, this.rtNebula.createView());
        } else if (this.rtStars && this.rtGalaxy) {
          this.composite.setInputs(this.rtStars.createView(), this.rtGalaxy.createView(), this.rtNebula.createView());
        }
      }
      if (this.bh && this.rtStars && this.rtGalaxyImp && this.rtGalaxyBand) {
        this.bh.setInputs(this.rtStars.createView(), this.rtGalaxyImp.createView(), this.rtGalaxyBand.createView());
      }
      if (this.lens) {
        if (this.bhEnabled && this.rtBH) {
          this.lens.setInputs(this.rtBH.createView(), this.blackView!);
        } else if (this.rtStars && this.rtGalaxy) {
          this.lens.setInputs(this.rtStars.createView(), this.rtGalaxy.createView());
        }
      }
    }
    if (this.stars) this.stars.setViewport(this.canvas.width, this.canvas.height);
    if (this.galaxy) this.galaxy.setViewport(this.canvas.width, this.canvas.height);
    if (this.nebula && this.rtNebula) this.nebula.setViewport(this.rtNebula.width, this.rtNebula.height);
    if (this.aurora && this.rtNebula) this.aurora.setViewport(this.rtNebula.width, this.rtNebula.height);
    if (this.meteors) this.meteors.setViewport(this.canvas.width, this.canvas.height);
    if (this.bh) this.bh.setViewport(this.canvas.width, this.canvas.height);
    if (this.lens) {
      // Update viewport and clamp center after resize
      this.lens.setViewport(this.canvas.width, this.canvas.height);
      const w = Math.max(1, this.canvas.width), h = Math.max(1, this.canvas.height);
      const rx = Math.min(0.5, this.lensRadiusPx / w);
      const ry = Math.min(0.5, this.lensRadiusPx / h);
      this.lensCenterX = Math.min(1 - rx, Math.max(rx, this.lensCenterX));
      this.lensCenterY = Math.min(1 - ry, Math.max(ry, this.lensCenterY));
      this.lens.setCenter(this.lensCenterX, this.lensCenterY);
    }
  }

  private loop = () => {
    if (this.device && this.ctx && this.stars && this.galaxy && this.composite && this.rtStars && this.rtGalaxy) {
      const now = performance.now();
      const t = (now - this.t0) * 0.001;
      const dt = this.lastT === 0 ? 0 : Math.min(0.05, Math.max(0, t - this.lastT));
      this.lastT = t;
      if (this.nebula) this.nebula.setTime(t);
      if (this.stars) (this.stars as any).setTime?.(t);
      if (this.galaxy) (this.galaxy as any).setTime?.(t);
      
      const swapTex = this.ctx.getCurrentTexture();
      const swapView = swapTex.createView();
      const encoder = this.device.createCommandEncoder();

      // Stars to RT (or clear)
      if (this.showStars) {
        this.stars.render(encoder, this.rtStars.createView());
      } else {
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.rtStars.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
        pass.end();
      }
      // Galaxy:
      if (this.showGalaxy) {
        // Band only into band RT
        this.galaxy.renderBand(encoder, this.rtGalaxyBand!.createView());
        // Combined RT: start with band again (cheap) then add impostors
        this.galaxy.renderBand(encoder, this.rtGalaxy!.createView());
        // Impostors: into combined (additive, load) and into separate impostor RT (clear)
        this.galaxy.renderImpostors(encoder, this.rtGalaxy!.createView(), false);
        this.galaxy.renderImpostors(encoder, this.rtGalaxyImp!.createView(), true);
      } else {
        // Clear all galaxy RTs
        let p1 = encoder.beginRenderPass({ colorAttachments: [{ view: this.rtGalaxy!.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] }); p1.end();
        let p2 = encoder.beginRenderPass({ colorAttachments: [{ view: this.rtGalaxyBand!.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] }); p2.end();
        let p3 = encoder.beginRenderPass({ colorAttachments: [{ view: this.rtGalaxyImp!.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] }); p3.end();
      }
      // Meteors into stars RT (additive)
      if (dt > 0) this.meteors?.update(dt);
      if (this.meteors) this.meteors.render(encoder, this.rtStars!.createView());
      // Nebula to RT (or clear to transparent)
      if (this.nebula && this.rtNebula) {
        if (this.showNebula) {
          this.nebula.render(encoder, this.rtNebula.createView());
        } else {
          const passN = encoder.beginRenderPass({ colorAttachments: [{ view: this.rtNebula.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }] });
          passN.end();
        }
        if (this.showAurora && this.aurora) {
          this.aurora.setTime(t);
          this.aurora.render(encoder, this.rtNebula.createView());
        }
      }
      // Choose background based on BH toggle
      if (this.bhEnabled && this.bh && this.rtBH) {
        this.bh.setOverlayOnly(false);
        // BH pass reads stars + galaxyImp (lensed) and adds galaxyBand (unlensed)
        this.bh.render(encoder, this.rtBH.createView());
        // Ensure composite and lens sample the BH background
        this.composite.setInputs(this.rtBH.createView(), this.blackView!, this.rtNebula!.createView());
        this.lens?.setInputs(this.rtBH.createView(), this.blackView!);
      } else {
        // Use raw stars+galaxy background
        this.composite.setInputs(this.rtStars!.createView(), this.rtGalaxy!.createView(), this.rtNebula!.createView());
        this.lens?.setInputs(this.rtStars!.createView(), this.rtGalaxy!.createView());
      }
      // Composite to screen
      this.composite.render(encoder, swapView);
      // Lens overlay to screen — top-most
      if (this.lens && this.lensEnabled) {
        this.lens.render(encoder, swapView);
      }

      this.device.queue.submit([encoder.finish()]);
    }

    this.rafId = requestAnimationFrame(this.loop);
  };
  // Stars interactions passthrough
  setStarCursor(xPx: number, yPx: number) { (this.stars as any)?.setCursor?.(xPx, yPx); (this.galaxy as any)?.setCursor?.(xPx, yPx); }
  setStarForce(radiusPx: number, strengthPx: number) { (this.stars as any)?.setCursorForce?.(radiusPx, strengthPx); (this.galaxy as any)?.setCursorForce?.(radiusPx, strengthPx); }
  triggerStarShockwave(xPx: number, yPx: number, ampPx?: number, speedPx?: number, widthPx?: number, damp?: number) { (this.stars as any)?.triggerShockwave?.(xPx, yPx, ampPx, speedPx, widthPx, damp); (this.galaxy as any)?.triggerShockwave?.(xPx, yPx, ampPx, speedPx, widthPx, damp); }

  private createTargetTexture(width: number, height: number, format: GPUTextureFormat): GPUTexture {
    return this.device!.createTexture({
      size: { width, height },
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
  }
}
