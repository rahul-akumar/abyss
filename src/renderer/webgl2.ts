import type { IRenderer, Preset, Quality } from './index';
import { generateStars } from './stars/generate';
import { WebGL2StarPass } from './stars/webgl2StarPass';
import { WebGL2GalaxyPass } from './galaxy/webgl2GalaxyPass';
import { WebGL2CompositePass } from './composite/webgl2CompositePass';
import { WebGL2NebulaPass } from './nebula/webgl2NebulaPass';
import { generateNebulaVolumes } from './nebula/generateVolumes';
import { WebGL2LensPass } from './lens/webgl2LensPass';
import { WebGL2MeteorPass } from './meteors/webgl2MeteorPass';
import { WebGL2BlackHolePass } from './blackhole/webgl2BlackHolePass';
import { WebGL2AuroraPass } from './aurora/webgl2AuroraPass';

export class WebGL2Engine implements IRenderer {
  private canvas: HTMLCanvasElement;
  private gl?: WebGL2RenderingContext;
  private rafId: number | null = null;
  private reduceMotion = false;
  private preset: Preset = 'glass';
  private quality: Quality = 'auto';
  private exposureEV = 0;
  private stars?: WebGL2StarPass;
  private galaxy?: WebGL2GalaxyPass;
  private composite?: WebGL2CompositePass;
  private fboStars?: WebGLFramebuffer;
  private texStars?: WebGLTexture;
  private fboGalaxy?: WebGLFramebuffer; // combined (band + impostors)
  private texGalaxy?: WebGLTexture;
  private fboGalaxyBand?: WebGLFramebuffer; // band only
  private texGalaxyBand?: WebGLTexture;
  private fboGalaxyImp?: WebGLFramebuffer; // impostors only
  private texGalaxyImp?: WebGLTexture;
  private fboNebula?: WebGLFramebuffer;
  private texNebula?: WebGLTexture;
  private fboBH?: WebGLFramebuffer;
  private texBH?: WebGLTexture;
  private nebula?: WebGL2NebulaPass;
  private texDensity3D?: WebGLTexture;
  private texWarp3D?: WebGLTexture;
  private lens?: WebGL2LensPass;
  private meteors?: WebGL2MeteorPass;
  private bh?: WebGL2BlackHolePass;
  private blackTex?: WebGLTexture;
  // Aurora
  private aurora?: WebGL2AuroraPass;
  private showAurora: boolean = false;
  private auroraAmplitude: number = 1.0;
  private auroraBlend: number = 0.5;
  private auroraSpeed: number = 1.0;
  private auroraStrength: number = 1.0;
  private auroraStops: [number, number, number][] = [
    [0.3215686275, 0.1529411765, 1.0],
    [0.4862745098, 1.0, 0.4039215686],
    [0.3215686275, 0.1529411765, 1.0],
  ];
  private t0: number = performance.now();
  private nebulaVibrancy: number = 1.0;
  private nebulaFlowSpeed: number = 0.38;
  private nebulaFlowAmp: number = 0.14;
  private nebulaSwirl: number = 1.6;
  private nebulaDriftX: number = 0.03;
  private nebulaDriftY: number = 0.00;
  private nebulaWarpSpeed: number = 0.12;
  // Forces (generator + sampling)
  private volFilament = 1.0; private volCavity = 1.0; private volBand = 1.0; private volPrewarp = 0.20; private volWarpVec = 0.70;
  private sampScaleX = 0.23; private sampScaleY = 0.17; private sampScaleZ = 0.26; private volTiltDeg = 12; private volSeed = 1337;
  private lastT: number = 0;
  private starCount: number = 20000;
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
  setStarCount(count: number) {
    this.starCount = Math.max(1000, Math.floor(count));
    if (this.gl && this.stars) {
      const starData = generateStars({ count: this.starCount, seed: 1337, bandTiltDeg: 0, bandSigma: 0.25, bandWeight: 0.0 });
      this.stars.setStarData(starData);
    }
  }
  setStarIntensity(intensity: number) { this.starIntensity = Math.max(0.0, intensity); if (this.stars) this.stars.setStarIntensity(this.starIntensity); }
  setTwinkleSpeed(speed: number) { this.twinkleSpeed = Math.max(0, speed); if (this.stars) (this.stars as any).setTwinkleSpeed?.(this.twinkleSpeed); }
  setTwinkleAmount(amount: number) { this.twinkleAmount = Math.max(0, Math.min(1, amount)); if (this.stars) (this.stars as any).setTwinkleAmount?.(this.twinkleAmount); }
  setNebulaParams(density: number, g: number) { if (this.nebula) this.nebula.setParams(density, g); }
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
    if (this.gl && this.texDensity3D && this.texWarp3D) {
      const { size: VS, density: volD, warp: volW } = generateNebulaVolumes({ size: 64, seed: this.volSeed, filament: this.volFilament, cavity: this.volCavity, band: this.volBand, prewarp: this.volPrewarp, warpVec: this.volWarpVec, tiltDeg: this.volTiltDeg, scaleX: 1.0, scaleY: 0.7, scaleZ: 1.2 });
      this.gl.bindTexture(this.gl.TEXTURE_3D, this.texDensity3D);
      this.gl.texImage3D(this.gl.TEXTURE_3D, 0, this.gl.RGBA8, VS, VS, VS, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, volD);
      this.gl.bindTexture(this.gl.TEXTURE_3D, this.texWarp3D);
      this.gl.texImage3D(this.gl.TEXTURE_3D, 0, this.gl.RGBA8, VS, VS, VS, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, volW);
      this.gl.bindTexture(this.gl.TEXTURE_3D, null);
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
  setLensMode(mode: 'glass'|'blackhole') { this.lensMode = mode; /* lens mode no longer controls black hole */ }
  setBHParams(mass: number, spin: number) { this.bhMass = mass; this.bhSpin = spin; if (this.bh) this.bh.setParams(mass, spin); }
  setBlackHoleEnabled(enabled: boolean) { this.bhEnabled = enabled; }
  setLensBloom(strength: number, threshold: number, radiusPx: number) { this.bloomStrength = strength; this.bloomThreshold = threshold; this.bloomRadiusPx = radiusPx; }
  setLensStreaks(strength: number, lengthPx: number, angleDeg: number) { this.streakStrength = strength; this.streakLengthPx = lengthPx; this.streakAngleDeg = angleDeg; }
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
  setAuroraStrength(strength: number) { this.auroraStrength = Math.max(0, strength); if (this.aurora) this.aurora.setStrength(this.auroraStrength); }

  start() {
    const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: true });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    this.resize();

    // Create offscreen targets
    this.createOffscreenTargets();

    const starData = generateStars({ count: this.starCount, seed: 1337, bandTiltDeg: 0, bandSigma: 0.25, bandWeight: 0.0 });
    this.stars = new WebGL2StarPass(gl, starData);
    this.stars.setExposure(this.exposureEV);
    this.stars.setStarIntensity(this.starIntensity);
    this.stars.setViewport(this.canvas.width, this.canvas.height);
    (this.stars as any).setTwinkleSpeed?.(this.twinkleSpeed);
    (this.stars as any).setTwinkleAmount?.(this.twinkleAmount);

    this.galaxy = new WebGL2GalaxyPass(gl);
    this.nebula = new WebGL2NebulaPass(gl);
    (this.nebula as any).setVibrancy?.(this.nebulaVibrancy);
    (this.nebula as any).setFlowParams?.(this.nebulaFlowSpeed, this.nebulaFlowAmp, this.nebulaSwirl, this.nebulaDriftX, this.nebulaDriftY, this.nebulaWarpSpeed);
    (this.nebula as any).setNoiseScale?.(this.sampScaleX, this.sampScaleY, this.sampScaleZ);

    // Create and upload 3D volumes
    const { size: VS, density: volD, warp: volW } = generateNebulaVolumes(64, 1337);
    this.texDensity3D = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, this.texDensity3D);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, VS, VS, VS, 0, gl.RGBA, gl.UNSIGNED_BYTE, volD);

    this.texWarp3D = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, this.texWarp3D);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, VS, VS, VS, 0, gl.RGBA, gl.UNSIGNED_BYTE, volW);
    gl.bindTexture(gl.TEXTURE_3D, null);

    (this.nebula as any).setVolumes?.(this.texDensity3D, this.texWarp3D);

    this.composite = new WebGL2CompositePass(gl);

    // Aurora pass uses same RT as nebula (overlay), rendered after nebula with premultiplied alpha
    this.aurora = new WebGL2AuroraPass(gl);
    this.aurora.setParams(this.auroraAmplitude, this.auroraBlend, this.auroraSpeed);
    this.aurora.setStrength(this.auroraStrength);
    this.aurora.setStops(this.auroraStops);

    this.lens = new WebGL2LensPass(gl);

    this.bh = new WebGL2BlackHolePass(gl);
    this.bh.setParams(this.bhMass, this.bhSpin);

    // 1x1 black texture for convenience
    this.blackTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.blackTex);
    const black = new Uint8Array([0,0,0,255]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, black);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.meteors = new WebGL2MeteorPass(gl);
    this.meteors.setViewport(this.canvas.width, this.canvas.height);
    this.meteors.setConfig({ enabled: this.shootingEnabled, ratePerMin: this.shootingRatePerMin, speedPx: this.shootingSpeedPx, lengthPx: this.shootingLengthPx, widthPx: this.shootingWidthPx, brightness: this.shootingBrightness });
    this.lens.setParams(this.lensRadiusPx, this.lensZoom, this.lensDispersion);
    this.lens.setCenter(this.lensCenterX, this.lensCenterY);
    this.lens.setEffects(this.bloomStrength, this.bloomThreshold, this.bloomRadiusPx, this.streakStrength, this.streakLengthPx, this.streakAngleDeg);

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

    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.createOffscreenTargets();
    }
    if (this.stars) this.stars.setViewport(this.canvas.width, this.canvas.height);
    if (this.meteors) this.meteors.setViewport(this.canvas.width, this.canvas.height);
    // Clamp lens center after resize to keep it inside bounds
    const rx = Math.min(0.5, this.lensRadiusPx / Math.max(1, this.canvas.width));
    const ry = Math.min(0.5, this.lensRadiusPx / Math.max(1, this.canvas.height));
    this.lensCenterX = Math.min(1 - rx, Math.max(rx, this.lensCenterX));
    this.lensCenterY = Math.min(1 - ry, Math.max(ry, this.lensCenterY));
  }

  private loop = () => {
    const gl = this.gl;
    if (gl && this.stars && this.galaxy && this.composite && this.fboStars && this.fboGalaxy && this.texStars && this.texGalaxy && this.fboNebula && this.texNebula && this.nebula) {
      const now = performance.now();
      const t = (now - this.t0) * 0.001;
      const dt = this.lastT === 0 ? 0 : Math.min(0.05, Math.max(0, t - this.lastT));
      this.lastT = t;
      this.nebula.setTime(t);
      (this.stars as any).setTime?.(t);
      (this.galaxy as any).setTime?.(t);

      // Stars to FBO
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboStars);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0,0,0,1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (this.showStars) this.stars.render();

      // Galaxy layers
      if (this.showGalaxy) {
        // Band only -> band FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboGalaxyBand);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0,0,0,1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.galaxy.renderBand();
        // Combined: band first
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboGalaxy);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0,0,0,1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.galaxy.renderBand();
        // Impostors into combined (additive)
        this.galaxy.renderImpostors();
        // Impostors only -> separate impostor FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboGalaxyImp);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0,0,0,1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.galaxy.renderImpostors();
      } else {
        // Clear galaxy FBOs
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboGalaxy);
        gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboGalaxyBand);
        gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboGalaxyImp);
        gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
      }

      // Meteors into Stars RT (additive)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboStars);
      if (dt > 0) this.meteors?.update(dt);
      this.meteors?.render();

      // Nebula to FBO (half-res)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboNebula);
      const halfW = Math.max(1, Math.floor(this.canvas.width/2));
      const halfH = Math.max(1, Math.floor(this.canvas.height/2));
      gl.viewport(0, 0, halfW, halfH);
      gl.clearColor(0,0,0,0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (this.showNebula) this.nebula.render(halfW, halfH);
      // Aurora overlay into the same RT (premultiplied alpha)
      if (this.showAurora) { this.aurora?.setTime(t); this.aurora?.render(halfW, halfH); }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // Branch on BH enabled toggle
      if (this.bhEnabled) {
        // Black hole background into RT
        if (this.fboBH && this.texBH) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBH);
          gl.viewport(0, 0, this.canvas.width, this.canvas.height);
          gl.clearColor(0,0,0,1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          this.bh?.setOverlayOnly(false);
          this.bh?.render(this.texStars!, this.texGalaxyImp!, this.texGalaxyBand!, this.canvas.width, this.canvas.height);
        }
        // Composite to screen using BH-lensed background under nebula
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0.02, 0.03, 0.06, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.composite.render(this.texBH!, this.blackTex!, this.texNebula!);
        // Lens overlay samples BH background — top-most
        if (this.lensEnabled) {
          this.lens?.setParams(this.lensRadiusPx, this.lensZoom, this.lensDispersion);
          this.lens?.setCenter(this.lensCenterX, this.lensCenterY);
          this.lens?.setEffects(this.bloomStrength, this.bloomThreshold, this.bloomRadiusPx, this.streakStrength, this.streakLengthPx, this.streakAngleDeg);
          this.lens?.render(this.texBH!, this.blackTex!, this.canvas.width, this.canvas.height);
        }
      } else {
        // No BH: composite raw stars+galaxy under nebula
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0.02, 0.03, 0.06, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.composite.render(this.texStars!, this.texGalaxy!, this.texNebula!);
        // Lens overlay samples raw background
        if (this.lensEnabled) {
          this.lens?.setParams(this.lensRadiusPx, this.lensZoom, this.lensDispersion);
          this.lens?.setCenter(this.lensCenterX, this.lensCenterY);
          this.lens?.setEffects(this.bloomStrength, this.bloomThreshold, this.bloomRadiusPx, this.streakStrength, this.streakLengthPx, this.streakAngleDeg);
          this.lens?.render(this.texStars!, this.texGalaxy!, this.canvas.width, this.canvas.height);
        }
      }
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  // Stars interactions passthrough
  setStarCursor(xPx: number, yPx: number) { (this.stars as any)?.setCursor?.(xPx, yPx); (this.galaxy as any)?.setCursor?.(xPx, yPx); }
  setStarForce(radiusPx: number, strengthPx: number) { (this.stars as any)?.setCursorForce?.(radiusPx, strengthPx); (this.galaxy as any)?.setCursorForce?.(radiusPx, strengthPx); }
  triggerStarShockwave(xPx: number, yPx: number, ampPx?: number, speedPx?: number, widthPx?: number, damp?: number) { (this.stars as any)?.triggerShockwave?.(xPx, yPx, ampPx, speedPx, widthPx, damp); (this.galaxy as any)?.triggerShockwave?.(xPx, yPx, ampPx, speedPx, widthPx, damp); }

  private createOffscreenTargets() {
    const gl = this.gl!;
    const w = this.canvas.width, h = this.canvas.height;
    // Stars
    if (!this.texStars) this.texStars = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texStars);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    if (!this.fboStars) this.fboStars = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboStars);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texStars, 0);

    // Galaxy combined
    if (!this.texGalaxy) this.texGalaxy = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texGalaxy);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    if (!this.fboGalaxy) this.fboGalaxy = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboGalaxy);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texGalaxy, 0);

    // Galaxy band only
    if (!this.texGalaxyBand) this.texGalaxyBand = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texGalaxyBand);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    if (!this.fboGalaxyBand) this.fboGalaxyBand = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboGalaxyBand);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texGalaxyBand, 0);

    // Galaxy impostors only
    if (!this.texGalaxyImp) this.texGalaxyImp = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texGalaxyImp);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    if (!this.fboGalaxyImp) this.fboGalaxyImp = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboGalaxyImp);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texGalaxyImp, 0);

    // BH background (full-res)
    if (!this.texBH) this.texBH = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texBH);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    if (!this.fboBH) this.fboBH = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBH);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texBH, 0);

    // Nebula (half-res)
    const wn = Math.max(1, Math.floor(w/2));
    const hn = Math.max(1, Math.floor(h/2));
    if (!this.texNebula) this.texNebula = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texNebula);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, wn, hn, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    if (!this.fboNebula) this.fboNebula = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboNebula);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texNebula, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}
