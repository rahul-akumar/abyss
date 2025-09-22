import { Engine, Quality, Preset } from '../renderer';

export class AbyssVeilElement extends HTMLElement {
  #shadow: ShadowRoot;
  #canvas: HTMLCanvasElement;
  #engine: Engine | null = null;
  #resizeObs?: ResizeObserver;
  #dragging = false;
  #dragOffsetX = 0;
  #dragOffsetY = 0;
  #lensRadius = 200;
  #lensCX = 0.5;
  #lensCY = 0.5;
  #controls?: HTMLDivElement;
  #lensEnabled = true;
  // Controls move/collapse state
  #wrap!: HTMLDivElement;
  #controlsCollapsed = true;
  #controlsPosX = 12;
  #controlsPosY = 12;
  #ctrlDragging = false;
  #ctrlDragOffsetX = 0;
  #ctrlDragOffsetY = 0;
  #toggleBtn?: HTMLButtonElement;
  #toggleDragging = false;
  #toggleDragOffsetX = 0;
  #toggleDragOffsetY = 0;
  #storageKey = 'abyss-veil-controls';
  // Star attractor (mouse) — radius and max displacement in CSS pixels (negative strength attracts)
  #starAttractorRadius = 140;
  #starAttractorStrength = -80;

  static get observedAttributes() {
    return ['preset', 'quality', 'reduce-motion', 'exposure', 'star-count', 'star-intensity', 'twinkle-speed', 'twinkle-amount', 'nebula-density', 'nebula-g', 'nebula-vibrancy', 'nebula-flow-speed', 'nebula-flow-amp', 'nebula-swirl', 'lens-radius', 'lens-zoom', 'lens-dispersion', 'bh-enabled', 'bh-mass', 'bh-spin', 'lens-bloom-strength', 'lens-bloom-threshold', 'lens-bloom-radius', 'lens-streak-strength', 'lens-streak-length', 'lens-streak-angle', 'shooting-enabled', 'shooting-rate', 'shooting-speed', 'shooting-length', 'shooting-width', 'shooting-brightness', 'show-stars', 'show-galaxy', 'show-nebula', 'lens-enabled', 'show-aurora', 'aurora-amplitude', 'aurora-blend', 'aurora-speed', 'aurora-stops', 'aurora-strength'];
  }

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host, .wrap { display: block; width: 100%; height: 100%; contain: content; position: relative; }
      canvas { width: 100%; height: 100%; display: block; }
      .controls { position: absolute; top: 12px; left: 12px; background: rgba(10,13,20,0.8); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 12px; font: 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; backdrop-filter: blur(4px); max-width: 320px; z-index: 20; box-shadow: 0 12px 24px rgba(0,0,0,0.35); }
      .controls h3 { margin: 6px 0 6px; font-size: 12px; color: #93c5fd; }
      .row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
      .row label { flex: 1 1 auto; }
      .row input[type="range"] { width: 140px; }
      details { margin: 4px 0; }
      summary { cursor: pointer; color: #a5b4fc; }
      .grid { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 6px 8px; }
      .muted { color: #9aa4b2; }
      /* Header/drag handle */
      .ctrl-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: -6px -8px 8px; padding: 6px 8px; background: rgba(255,255,255,0.04); border-radius: 6px; cursor: grab; user-select: none; }
      .controls.dragging .ctrl-header { cursor: grabbing; }
      .ctrl-title { font-weight: 600; font-size: 12px; color: #e5e7eb; letter-spacing: 0.02em; }
      .btn-icon { appearance: none; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.06); color: #cbd5e1; border-radius: 6px; padding: 4px 8px; font: inherit; cursor: pointer; }
      .btn-icon:hover { background: rgba(255,255,255,0.12); }
      .btn-icon:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
      /* Floating toggle button */
      .controls-toggle { position: absolute; top: 12px; left: 12px; width: 40px; height: 40px; border-radius: 999px; background: rgba(10,13,20,0.9); border: 1px solid rgba(255,255,255,0.12); color: #cbd5e1; display: none; align-items: center; justify-content: center; font: 16px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; cursor: grab; z-index: 21; box-shadow: 0 12px 24px rgba(0,0,0,0.4); }
      .controls-toggle.dragging { cursor: grabbing; }
      .controls-toggle:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
      /* Toggle switch */
      .switch { position: relative; display: inline-block; width: 38px; height: 22px; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider { position: absolute; cursor: pointer; inset: 0; background: #475569; transition: 0.2s ease; border-radius: 999px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.15); }
      .slider:before { content: ""; position: absolute; height: 16px; width: 16px; left: 3px; top: 3px; background: #e2e8f0; border-radius: 50%; transition: 0.2s ease; }
      .switch input:checked + .slider { background: #22c55e; }
      .switch input:checked + .slider:before { transform: translateX(16px); }
      .switch input:focus-visible + .slider { outline: 2px solid #93c5fd; outline-offset: 2px; }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    this.#wrap = wrap;

    this.#canvas = document.createElement('canvas');
    wrap.appendChild(this.#canvas);

    // Controls container
    this.#controls = document.createElement('div');
    this.#controls.className = 'controls';
    this.#controls.innerHTML = this.#controlsHTML();
    // initial position
    this.#controls.style.left = `${this.#controlsPosX}px`;
    this.#controls.style.top = `${this.#controlsPosY}px`;
    wrap.appendChild(this.#controls);

    // Collapsed toggle button
    const toggle = document.createElement('button');
    toggle.className = 'controls-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Open controls');
    toggle.title = 'Open controls';
    toggle.textContent = '⚙';
    toggle.style.left = `${this.#controlsPosX}px`;
    toggle.style.top = `${this.#controlsPosY}px`;
    toggle.style.display = 'none';
    this.#toggleBtn = toggle;
    wrap.appendChild(toggle);

    this.#shadow.appendChild(style);
    this.#shadow.appendChild(wrap);
  }

  connectedCallback() {
    const preset = (this.getAttribute('preset') || 'glass') as Preset;
    const quality = (this.getAttribute('quality') || 'auto') as Quality;
    const reduceMotionAttr = this.getAttribute('reduce-motion');
    const reduceMotion = reduceMotionAttr != null ? reduceMotionAttr !== 'false' : matchMedia('(prefers-reduced-motion: reduce)').matches;
    const exposure = parseFloat(this.getAttribute('exposure') || '0') || 0;
    const starCount = (() => { const v = this.getAttribute('star-count'); return v != null ? Math.max(1000, Math.floor(parseFloat(v))) : 30000; })();
    const starIntensity = (() => { const v = this.getAttribute('star-intensity'); return v != null ? Math.max(0, parseFloat(v)) : 1.0; })();
    const twinkleSpeed = (() => { const v = this.getAttribute('twinkle-speed'); return v != null ? Math.max(0, parseFloat(v)) : 0.12; })();
    const twinkleAmount = (() => { const v = this.getAttribute('twinkle-amount'); return v != null ? Math.max(0, Math.min(1, parseFloat(v))) : 0.25; })();
    const nebulaDensity = (() => { const v = this.getAttribute('nebula-density'); return v != null ? Math.max(0, Math.min(1, parseFloat(v))) : 0.5; })();
    const nebulaG = (() => { const v = this.getAttribute('nebula-g'); return v != null ? parseFloat(v) : 0.2; })();
    const nebulaVibrancy = (() => { const v = this.getAttribute('nebula-vibrancy'); return v != null ? Math.max(0, Math.min(1, parseFloat(v))) : 1.0; })();
    const nebulaFlowSpeed = (() => { const v = this.getAttribute('nebula-flow-speed'); return v != null ? parseFloat(v) : 0.38; })();
    const nebulaFlowAmp = (() => { const v = this.getAttribute('nebula-flow-amp'); return v != null ? parseFloat(v) : 0.14; })();
    const nebulaSwirl = (() => { const v = this.getAttribute('nebula-swirl'); return v != null ? parseFloat(v) : 1.6; })();
    const lensRadius = (() => { const v = this.getAttribute('lens-radius'); return v != null ? Math.max(10, parseFloat(v)) : 200; })();
    const lensZoom = (() => { const v = this.getAttribute('lens-zoom'); return v != null ? Math.max(1.0, parseFloat(v)) : 1.25; })();
    const lensDispersion = (() => { const v = this.getAttribute('lens-dispersion'); return v != null ? Math.max(0, Math.min(1, parseFloat(v))) : 0.35; })();
    const bhEnabled = (() => { const v = this.getAttribute('bh-enabled'); return v != null ? v !== 'false' : false; })();
    const bhMass = (() => { const v = this.getAttribute('bh-mass'); return v != null ? Math.max(0.1, parseFloat(v)) : 1.0; })();
    const bhSpin = (() => { const v = this.getAttribute('bh-spin'); return v != null ? Math.max(0.0, Math.min(1.0, parseFloat(v))) : 0.7; })();
    const lensBloomStrength = (() => { const v = this.getAttribute('lens-bloom-strength'); return v != null ? Math.max(0, parseFloat(v)) : 0.6; })();
    const lensBloomThreshold = (() => { const v = this.getAttribute('lens-bloom-threshold'); return v != null ? Math.max(0, Math.min(1, parseFloat(v))) : 0.7; })();
    const lensBloomRadius = (() => { const v = this.getAttribute('lens-bloom-radius'); return v != null ? Math.max(0, parseFloat(v)) : 8; })();
    const lensStreakStrength = (() => { const v = this.getAttribute('lens-streak-strength'); return v != null ? Math.max(0, parseFloat(v)) : 0.8; })();
    const lensStreakLength = (() => { const v = this.getAttribute('lens-streak-length'); return v != null ? Math.max(0, parseFloat(v)) : 120; })();
    const lensStreakAngle = (() => { const v = this.getAttribute('lens-streak-angle'); return v != null ? parseFloat(v) : 0; })();

    const showStars = (() => { const v = this.getAttribute('show-stars'); return v != null ? v !== 'false' : true; })();
    const showGalaxy = (() => { const v = this.getAttribute('show-galaxy'); return v != null ? v !== 'false' : true; })();
    const showNebula = (() => { const v = this.getAttribute('show-nebula'); return v != null ? v !== 'false' : true; })();
    const lensEnabled = (() => { const v = this.getAttribute('lens-enabled'); return v != null ? v !== 'false' : true; })();

    // Shooting stars defaults
    const shootingEnabled = (() => { const v = this.getAttribute('shooting-enabled'); return v != null ? v !== 'false' : true; })();
    const shootingRate = (() => { const v = this.getAttribute('shooting-rate'); return v != null ? Math.max(0, parseFloat(v)) : 8; })();
    const shootingSpeed = (() => { const v = this.getAttribute('shooting-speed'); return v != null ? Math.max(10, parseFloat(v)) : 500; })();
    const shootingLength = (() => { const v = this.getAttribute('shooting-length'); return v != null ? Math.max(10, parseFloat(v)) : 180; })();
    const shootingWidth = (() => { const v = this.getAttribute('shooting-width'); return v != null ? Math.max(1, parseFloat(v)) : 2; })();
    const shootingBrightness = (() => { const v = this.getAttribute('shooting-brightness'); return v != null ? Math.max(0, parseFloat(v)) : 1.5; })();

    this.#engine = new Engine(this.#canvas, { reduceMotion });
    this.#engine.setPreset(preset);
    this.#engine.setQuality(quality);
    this.#engine.setExposure(exposure);
    this.#engine.setStarCount(starCount);
    this.#engine.setStarIntensity(starIntensity);
    this.#engine.setTwinkleSpeed(twinkleSpeed);
    this.#engine.setTwinkleAmount(twinkleAmount);
    this.#engine.setNebulaParams(nebulaDensity, nebulaG);
    (this.#engine as any).setNebulaVibrancy?.(nebulaVibrancy);
    this.#engine.setLensParams(lensRadius, lensZoom, lensDispersion);
    (this.#engine as any).setNebulaFlow?.(nebulaFlowSpeed, nebulaFlowAmp, nebulaSwirl, 0.03, 0.0, 0.12);
    this.#engine.setBlackHoleEnabled?.(bhEnabled as any);
    this.#engine.setBHParams(bhMass, bhSpin);
    this.#engine.setShowStars(showStars);
    this.#engine.setShowGalaxy(showGalaxy);
    this.#engine.setShowNebula(showNebula);
    this.#lensEnabled = lensEnabled;
    this.#engine.setLensEnabled(lensEnabled);
    this.#engine.setLensBloom(lensBloomStrength, lensBloomThreshold, lensBloomRadius);
    this.#engine.setLensStreaks(lensStreakStrength, lensStreakLength, lensStreakAngle);

    // Shooting stars
    this.#engine.setShootingStarsEnabled(shootingEnabled);
    this.#engine.setShootingStarsParams(shootingRate, shootingSpeed, shootingLength, shootingWidth, shootingBrightness);

    // Aurora setup (defaults emulate the provided reference)
    const showAurora = (() => { const v = this.getAttribute('show-aurora'); return v != null ? v !== 'false' : false; })();
    const auroraAmplitude = (() => { const v = this.getAttribute('aurora-amplitude'); return v != null ? parseFloat(v) : 1.0; })();
    const auroraBlend = (() => { const v = this.getAttribute('aurora-blend'); return v != null ? parseFloat(v) : 0.5; })();
    const auroraSpeed = (() => { const v = this.getAttribute('aurora-speed'); return v != null ? parseFloat(v) : 1.0; })();
    const defaultStops = ['#5227FF', '#7cff67', '#5227FF'];
    const stopsStr = (this.getAttribute('aurora-stops') || defaultStops.join(','));
    const stopsList = stopsStr.split(',').map(s => s.trim());
    const parseHex = (hex: string) => {
      const h = hex.replace('#','');
      const r = parseInt(h.length===3? h[0]+h[0] : h.substring(0,2), 16)/255;
      const g = parseInt(h.length===3? h[1]+h[1] : h.substring(2,4), 16)/255;
      const b = parseInt(h.length===3? h[2]+h[2] : h.substring(4,6), 16)/255;
      const toLin = (c:number)=> c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
      return [toLin(r), toLin(g), toLin(b)] as [number,number,number];
    };
    const auroraStops = (stopsList.length>0? stopsList : defaultStops).slice(0,8).map(parseHex) as [number,number,number][];
    (this.#engine as any).setAuroraEnabled?.(showAurora);
    (this.#engine as any).setAuroraParams?.(auroraAmplitude, auroraBlend, auroraSpeed);
    const auroraStrength = (() => { const v = this.getAttribute('aurora-strength'); return v != null ? parseFloat(v) : 1.0; })();
    (this.#engine as any).setAuroraStrength?.(auroraStrength);
    (this.#engine as any).setAuroraStops?.(auroraStops);

    this.#engine.start();


    // Bind UI events
    this.#bindControls();

    // Make controls movable/collapsible
    this.#setupControlsMovable();

    // pointer interactions for draggable lens
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // only left button starts drag
      const rect = this.#canvas.getBoundingClientRect();
      const x = e.clientX - rect.left; const y = e.clientY - rect.top;
      // Hit-test: start drag only if pointer is within current lens circle
      const lensPxX = this.#lensCX * rect.width;
      const lensPxY = this.#lensCY * rect.height;
      const dist = Math.hypot(x - lensPxX, y - lensPxY);
      if (dist > this.#lensRadius) return;
      this.#dragging = true;
      // preserve grab offset so the lens doesn't jump under the cursor
      this.#dragOffsetX = x - lensPxX;
      this.#dragOffsetY = y - lensPxY;
      this.#canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const rect = this.#canvas.getBoundingClientRect();
      const xCss = e.clientX - rect.left;
      const yCss = e.clientY - rect.top;
      // Update star attractor (convert to device pixels)
      const scaleX = this.#canvas.width / Math.max(1, rect.width);
      const scaleY = this.#canvas.height / Math.max(1, rect.height);
      const px = xCss * scaleX;
      const py = yCss * scaleY;
      const scaleAvg = (scaleX + scaleY) * 0.5;
      const radiusPx = this.#starAttractorRadius * scaleAvg;
      const strengthPx = this.#starAttractorStrength * scaleAvg; // negative = attract
      // Gate attractor when over lens (and lens is enabled)
      const lensPxX = this.#lensCX * rect.width;
      const lensPxY = this.#lensCY * rect.height;
      const onLens = this.#lensEnabled && (Math.hypot(xCss - lensPxX, yCss - lensPxY) <= this.#lensRadius);
      if (onLens) {
        (this.#engine as any).setStarForce?.(0, 0);
        (this.#engine as any).setStarCursor?.(-1e6, -1e6);
      } else {
        (this.#engine as any).setStarCursor?.(px, py);
        (this.#engine as any).setStarForce?.(radiusPx, strengthPx);
      }

      // Lens dragging if active
      if (!this.#dragging) return;
      const targetX = xCss - this.#dragOffsetX;
      const targetY = yCss - this.#dragOffsetY;
      // Clamp so the entire lens stays within bounds (use CSS px here)
      let minCx = this.#lensRadius / Math.max(1, rect.width);
      let maxCx = 1 - minCx;
      if (minCx > maxCx) { minCx = maxCx = 0.5; }
      let minCy = this.#lensRadius / Math.max(1, rect.height);
      let maxCy = 1 - minCy;
      if (minCy > maxCy) { minCy = maxCy = 0.5; }
      const cx = Math.min(maxCx, Math.max(minCx, targetX / Math.max(1, rect.width)));
      const cy = Math.min(maxCy, Math.max(minCy, targetY / Math.max(1, rect.height)));
      this.#lensCX = cx; this.#lensCY = cy;
      this.#engine?.setLensCenter(cx, cy);
    };
    const endDrag = (e: PointerEvent) => {
      this.#dragging = false;
      try { this.#canvas.releasePointerCapture(e.pointerId); } catch {}
      // Disable star attractor when pointer leaves/cancels; keep it on for pointerup inside canvas
      if (e.type === 'pointerleave' || e.type === 'pointercancel') {
        (this.#engine as any).setStarForce?.(0, 0);
        (this.#engine as any).setStarCursor?.(-1e6, -1e6);
      }
    };
    this.#canvas.addEventListener('pointerdown', onPointerDown);
    this.#canvas.addEventListener('pointermove', onPointerMove);
    this.#canvas.addEventListener('pointerup', endDrag);
    this.#canvas.addEventListener('pointercancel', endDrag);
    this.#canvas.addEventListener('pointerleave', endDrag);

    // Click shockwave (stars only, unless clicking over lens)
    this.#canvas.addEventListener('click', (e: MouseEvent) => {
      if (this.#dragging) return; // ignore clicks that are part of a drag
      const rect = this.#canvas.getBoundingClientRect();
      const xCss = e.clientX - rect.left;
      const yCss = e.clientY - rect.top;
      const lensPxX = this.#lensCX * rect.width;
      const lensPxY = this.#lensCY * rect.height;
      const overLens = Math.hypot(xCss - lensPxX, yCss - lensPxY) <= this.#lensRadius;
      if (overLens) return; // do not trigger shockwave on lens

      const scaleX = this.#canvas.width / rect.width;
      const scaleY = this.#canvas.height / rect.height;
      const px = xCss * scaleX;
      const py = yCss * scaleY;
      (this.#engine as any).triggerStarShockwave?.(px, py, 80, 1200, 90, 2.2);
    });

    // Mouse wheel: adjust lens radius (scroll up -> increase, down -> decrease)
    const onWheel = (e: WheelEvent) => {
      // Only react when scrolling over the lens area
      const rect = this.#canvas.getBoundingClientRect();
      const x = e.clientX - rect.left; const y = e.clientY - rect.top;
      const lensPxX = this.#lensCX * rect.width;
      const lensPxY = this.#lensCY * rect.height;
      const dist = Math.hypot(x - lensPxX, y - lensPxY);
      if (dist > this.#lensRadius) return;

      e.preventDefault();
      const step = e.ctrlKey ? 20 : 10; // finer control; hold Ctrl for larger steps
      const delta = e.deltaY < 0 ? step : -step; // wheel up is negative deltaY

      // Clamp to slider's range if available; otherwise sensible defaults
      const rng = this.#controls?.querySelector('#rng-lens-radius') as HTMLInputElement | null;
      const min = rng?.min ? parseFloat(rng.min) : 50;
      const max = rng?.max ? parseFloat(rng.max) : 600;

      const newRadius = Math.min(max, Math.max(min, this.#lensRadius + delta));
      this.#lensRadius = newRadius;
      this.setAttribute('lens-radius', String(newRadius));

      // After radius change, clamp center so lens stays within bounds
      const minCx = newRadius / Math.max(1, rect.width);
      const minCy = newRadius / Math.max(1, rect.height);
      const maxCx = 1 - minCx;
      const maxCy = 1 - minCy;
      // If radius exceeds half-dimension, center locks to 0.5 on that axis
      const clampAxis = (c: number, minV: number, maxV: number) => (minV > maxV ? 0.5 : Math.min(maxV, Math.max(minV, c)));
      this.#lensCX = clampAxis(this.#lensCX, minCx, maxCx);
      this.#lensCY = clampAxis(this.#lensCY, minCy, maxCy);
      this.#engine?.setLensCenter(this.#lensCX, this.#lensCY);

      // Keep UI controls in sync
      if (rng) rng.valueAsNumber = newRadius;
      const label = this.#controls?.querySelector('#val-lens-radius') as HTMLElement | null;
      if (label) label.textContent = newRadius.toFixed(0);
    };
    this.#canvas.addEventListener('wheel', onWheel, { passive: false });

    this.#resizeObs = new ResizeObserver(() => this.#engine?.resize());
    this.#resizeObs.observe(this.#canvas);
  }

  disconnectedCallback() {
    this.#resizeObs?.disconnect();
    this.#engine?.stop();
    this.#engine = null;
  }

  attributeChangedCallback(name: string) {
    if (!this.#engine) return;
    if (name === 'preset') {
      this.#engine.setPreset((this.getAttribute('preset') || 'glass') as Preset);
    } else if (name === 'quality') {
      this.#engine.setQuality((this.getAttribute('quality') || 'auto') as Quality);
    } else if (name === 'reduce-motion') {
      const reduceMotionAttr = this.getAttribute('reduce-motion');
      const reduceMotion = reduceMotionAttr != null ? reduceMotionAttr !== 'false' : matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.#engine.setReduceMotion(reduceMotion);
    } else if (name === 'exposure') {
      const exposure = parseFloat(this.getAttribute('exposure') || '0') || 0;
      this.#engine.setExposure(exposure);
    } else if (name === 'star-count') {
      const v = this.getAttribute('star-count');
      const count = v != null ? Math.max(1000, Math.floor(parseFloat(v))) : 30000;
      (this.#engine as any).setStarCount?.(count);
    } else if (name === 'star-intensity') {
      const v = this.getAttribute('star-intensity');
      const intensity = v != null ? Math.max(0, parseFloat(v)) : 1.0;
      (this.#engine as any).setStarIntensity?.(intensity);
    } else if (name === 'twinkle-speed') {
      const v = this.getAttribute('twinkle-speed');
      const speed = v != null ? Math.max(0, parseFloat(v)) : 0.12;
      (this.#engine as any).setTwinkleSpeed?.(speed);
    } else if (name === 'twinkle-amount') {
      const v = this.getAttribute('twinkle-amount');
      const amt = v != null ? Math.max(0, Math.min(1, parseFloat(v))) : 0.25;
      (this.#engine as any).setTwinkleAmount?.(amt);
    } else if (name === 'nebula-density' || name === 'nebula-g') {
      const dAttr = this.getAttribute('nebula-density');
      const gAttr = this.getAttribute('nebula-g');
      const density = dAttr != null ? Math.max(0, Math.min(1, parseFloat(dAttr))) : 0.5;
      const g = gAttr != null ? parseFloat(gAttr) : 0.2;
      this.#engine.setNebulaParams(density, g);
    } else if (name === 'nebula-vibrancy') {
      const vAttr = this.getAttribute('nebula-vibrancy');
      const vib = vAttr != null ? Math.max(0, Math.min(1, parseFloat(vAttr))) : 1.0;
      (this.#engine as any).setNebulaVibrancy?.(vib);
    } else if (name === 'nebula-flow-speed' || name === 'nebula-flow-amp' || name === 'nebula-swirl') {
      const flowSpeed = (() => { const v = this.getAttribute('nebula-flow-speed'); return v != null ? parseFloat(v) : 0.38; })();
      const flowAmp = (() => { const v = this.getAttribute('nebula-flow-amp'); return v != null ? parseFloat(v) : 0.14; })();
      const swirl = (() => { const v = this.getAttribute('nebula-swirl'); return v != null ? parseFloat(v) : 1.6; })();
      (this.#engine as any).setNebulaFlow?.(flowSpeed, flowAmp, swirl, 0.03, 0.0, 0.12);
    } else if (name === 'lens-radius' || name === 'lens-zoom' || name === 'lens-dispersion') {
      const rAttr = this.getAttribute('lens-radius');
      if (rAttr != null) this.#lensRadius = Math.max(10, parseFloat(rAttr));
      const zAttr = this.getAttribute('lens-zoom');
      const dAttr = this.getAttribute('lens-dispersion');
      const radius = rAttr != null ? Math.max(10, parseFloat(rAttr)) : 200;
      const zoom = zAttr != null ? Math.max(1.0, parseFloat(zAttr)) : 1.25;
      const disp = dAttr != null ? Math.max(0, Math.min(1, parseFloat(dAttr))) : 0.35;
      this.#engine.setLensParams(radius, zoom, disp);
      // Clamp center to keep lens within bounds after radius change
      const rect = this.#canvas.getBoundingClientRect();
      const minCx = radius / Math.max(1, rect.width);
      const minCy = radius / Math.max(1, rect.height);
      const maxCx = 1 - minCx;
      const maxCy = 1 - minCy;
      const clampAxis = (c: number, minV: number, maxV: number) => (minV > maxV ? 0.5 : Math.min(maxV, Math.max(minV, c)));
      this.#lensCX = clampAxis(this.#lensCX, minCx, maxCx);
      this.#lensCY = clampAxis(this.#lensCY, minCy, maxCy);
      this.#engine.setLensCenter(this.#lensCX, this.#lensCY);
    } else if (name === 'bh-mass' || name === 'bh-spin') {
      const massAttr = this.getAttribute('bh-mass');
      const spinAttr = this.getAttribute('bh-spin');
      const mass = massAttr != null ? Math.max(0.1, parseFloat(massAttr)) : 1.0;
      const spin = spinAttr != null ? Math.max(0.0, Math.min(1.0, parseFloat(spinAttr))) : 0.7;
      this.#engine.setBHParams(mass, spin);
    } else if (name === 'bh-enabled') {
      const v = this.getAttribute('bh-enabled');
      (this.#engine as any).setBlackHoleEnabled?.(v != null ? v !== 'false' : false);
    } else if (name === 'lens-bloom-strength' || name === 'lens-bloom-threshold' || name === 'lens-bloom-radius' || name === 'lens-streak-strength' || name === 'lens-streak-length' || name === 'lens-streak-angle') {
      const bs = (() => { const v = this.getAttribute('lens-bloom-strength'); return v != null ? Math.max(0, parseFloat(v)) : 0.6; })();
      const bt = (() => { const v = this.getAttribute('lens-bloom-threshold'); return v != null ? Math.max(0, Math.min(1, parseFloat(v))) : 0.7; })();
      const br = (() => { const v = this.getAttribute('lens-bloom-radius'); return v != null ? Math.max(0, parseFloat(v)) : 8; })();
      const ss = (() => { const v = this.getAttribute('lens-streak-strength'); return v != null ? Math.max(0, parseFloat(v)) : 0.8; })();
      const sl = (() => { const v = this.getAttribute('lens-streak-length'); return v != null ? Math.max(0, parseFloat(v)) : 120; })();
      const sa = (() => { const v = this.getAttribute('lens-streak-angle'); return v != null ? parseFloat(v) : 0; })();
      (this.#engine as any).setLensBloom?.(bs, bt, br);
      (this.#engine as any).setLensStreaks?.(ss, sl, sa);
    } else if (name === 'show-stars') {
      const v = this.getAttribute('show-stars');
      this.#engine.setShowStars(v != null ? v !== 'false' : true);
    } else if (name === 'show-galaxy') {
      const v = this.getAttribute('show-galaxy');
      this.#engine.setShowGalaxy(v != null ? v !== 'false' : true);
    } else if (name === 'show-nebula') {
      const v = this.getAttribute('show-nebula');
      this.#engine.setShowNebula(v != null ? v !== 'false' : true);
    } else if (name === 'show-aurora') {
      const v = this.getAttribute('show-aurora');
      (this.#engine as any).setAuroraEnabled?.(v != null ? v !== 'false' : false);
    } else if (name === 'aurora-amplitude' || name === 'aurora-blend' || name === 'aurora-speed') {
      const amp = (() => { const v = this.getAttribute('aurora-amplitude'); return v != null ? parseFloat(v) : 1.0; })();
      const blend = (() => { const v = this.getAttribute('aurora-blend'); return v != null ? parseFloat(v) : 0.5; })();
      const speed = (() => { const v = this.getAttribute('aurora-speed'); return v != null ? parseFloat(v) : 1.0; })();
      (this.#engine as any).setAuroraParams?.(amp, blend, speed);
    } else if (name === 'aurora-stops') {
      const defaultStops = ['#5227FF', '#7cff67', '#5227FF'];
      const stopsStr = (this.getAttribute('aurora-stops') || defaultStops.join(','));
      const stopsList = stopsStr.split(',').map(s => s.trim());
      const parseHex = (hex: string) => {
        const h = hex.replace('#','');
        const r = parseInt(h.length===3? h[0]+h[0] : h.substring(0,2), 16)/255;
        const g = parseInt(h.length===3? h[1]+h[1] : h.substring(2,4), 16)/255;
        const b = parseInt(h.length===3? h[2]+h[2] : h.substring(4,6), 16)/255;
        const toLin = (c:number)=> c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
        return [toLin(r), toLin(g), toLin(b)] as [number,number,number];
      };
      const auroraStops = (stopsList.length>0? stopsList : defaultStops).slice(0,8).map(parseHex) as [number,number,number][];
      (this.#engine as any).setAuroraStops?.(auroraStops);
    } else if (name === 'aurora-strength') {
      const sAttr = this.getAttribute('aurora-strength');
      const s = sAttr != null ? Math.max(0, parseFloat(sAttr)) : 1.0;
      (this.#engine as any).setAuroraStrength?.(s);
    } else if (name === 'lens-enabled') {
      const v = this.getAttribute('lens-enabled');
      const enabled = v != null ? v !== 'false' : true;
      this.#lensEnabled = enabled;
      this.#engine.setLensEnabled(enabled);
    } else if (name === 'shooting-enabled' || name === 'shooting-rate' || name === 'shooting-speed' || name === 'shooting-length' || name === 'shooting-width' || name === 'shooting-brightness') {
      const enAttr = this.getAttribute('shooting-enabled');
      const enabled = enAttr != null ? enAttr !== 'false' : true;
      const rate = (()=>{ const v = this.getAttribute('shooting-rate'); return v != null ? Math.max(0, parseFloat(v!)) : 8; })();
      const speed = (()=>{ const v = this.getAttribute('shooting-speed'); return v != null ? Math.max(10, parseFloat(v!)) : 500; })();
      const len = (()=>{ const v = this.getAttribute('shooting-length'); return v != null ? Math.max(10, parseFloat(v!)) : 180; })();
      const wid = (()=>{ const v = this.getAttribute('shooting-width'); return v != null ? Math.max(1, parseFloat(v!)) : 2; })();
      const bri = (()=>{ const v = this.getAttribute('shooting-brightness'); return v != null ? Math.max(0, parseFloat(v!)) : 1.5; })();
      this.#engine.setShootingStarsEnabled(enabled);
      this.#engine.setShootingStarsParams(rate, speed, len, wid, bri);
    }
  }
  // Build controls HTML
  #controlsHTML(): string {
    return `
      <div class="ctrl-header" id="ctrl-header">
        <div class="ctrl-title">Controls</div>
        <button class="btn-icon" id="btn-collapse" type="button" title="Collapse">▾</button>
      </div>
      <div class="ctrl-body">
      <div class="section">
        <h3>Visibility</h3>
        <div class="grid">
          <span>Stars</span>
          <label class="switch">
            <input type="checkbox" id="chk-stars" checked>
            <span class="slider"></span>
          </label>

          <span>Galaxy</span>
          <label class="switch">
            <input type="checkbox" id="chk-galaxy" checked>
            <span class="slider"></span>
          </label>

          <span>Nebula</span>
          <label class="switch">
            <input type="checkbox" id="chk-nebula" checked>
            <span class="slider"></span>
          </label>

          <span>Aurora</span>
          <label class="switch">
            <input type="checkbox" id="chk-aurora">
            <span class="slider"></span>
          </label>

          <span>Shooting stars</span>
          <label class="switch">
            <input type="checkbox" id="chk-shooting-vis" checked>
            <span class="slider"></span>
          </label>

          <span>Lens</span>
          <label class="switch">
            <input type="checkbox" id="chk-lens" checked>
            <span class="slider"></span>
          </label>

          <span>Black hole</span>
          <label class="switch">
            <input type="checkbox" id="chk-bh">
            <span class="slider"></span>
          </label>
        </div>
      </div>
      <div class="section">
        <h3>Exposure</h3>
        <div class="row"><label>EV</label><input type="range" id="rng-exposure" min="-4" max="4" step="0.1" value="0"><span id="val-exposure" class="muted">0</span></div>
      </div>
      <details open>
        <summary>Stars</summary>
        <div class="row"><label>Count</label><input type="range" id="rng-star-count" min="5000" max="80000" step="1000" value="30000"><span id="val-star-count" class="muted">30000</span></div>
        <div class="row"><label>Intensity</label><input type="range" id="rng-star-intensity" min="0" max="2" step="0.01" value="1.00"><span id="val-star-intensity" class="muted">1.00</span></div>
        <div class="row"><label>Twinkle speed</label><input type="range" id="rng-twinkle-speed" min="0" max="1.0" step="0.01" value="0.12"><span id="val-twinkle-speed" class="muted">0.12</span></div>
        <div class="row"><label>Twinkle amount</label><input type="range" id="rng-twinkle-amount" min="0" max="1.0" step="0.01" value="0.25"><span id="val-twinkle-amount" class="muted">0.25</span></div>
      </details>
      <details open>
        <summary>Shooting stars</summary>
        <div class="row"><label>Rate (per min)</label><input type="range" id="rng-shooting-rate" min="0" max="30" step="1" value="8"><span id="val-shooting-rate" class="muted">8</span></div>
        <div class="row"><label>Speed (px/s)</label><input type="range" id="rng-shooting-speed" min="100" max="1500" step="10" value="500"><span id="val-shooting-speed" class="muted">500</span></div>
        <div class="row"><label>Length (px)</label><input type="range" id="rng-shooting-length" min="50" max="400" step="1" value="180"><span id="val-shooting-length" class="muted">180</span></div>
        <div class="row"><label>Width (px)</label><input type="range" id="rng-shooting-width" min="1" max="6" step="1" value="2"><span id="val-shooting-width" class="muted">2</span></div>
        <div class="row"><label>Brightness</label><input type="range" id="rng-shooting-brightness" min="0" max="3" step="0.1" value="1.5"><span id="val-shooting-brightness" class="muted">1.5</span></div>
      </details>
      <details open>
        <summary>Nebula</summary>
        <div class="row"><label>Density</label><input type="range" id="rng-nebula-density" min="0" max="1" step="0.01" value="0.5"><span id="val-nebula-density" class="muted">0.50</span></div>
        <div class="row"><label>g (anisotropy)</label><input type="range" id="rng-nebula-g" min="-0.5" max="0.9" step="0.05" value="0.2"><span id="val-nebula-g" class="muted">0.20</span></div>
        <div class="row"><label>Vibrancy</label><input type="range" id="rng-nebula-vibrancy" min="0" max="1" step="0.01" value="1.00"><span id="val-nebula-vibrancy" class="muted">1.00</span></div>
        <div class="row"><label>Flow speed</label><input type="range" id="rng-nebula-flow-speed" min="0" max="2.0" step="0.01" value="0.38"><span id="val-nebula-flow-speed" class="muted">0.38</span></div>
        <div class="row"><label>Curl amp</label><input type="range" id="rng-nebula-flow-amp" min="0" max="0.5" step="0.005" value="0.14"><span id="val-nebula-flow-amp" class="muted">0.14</span></div>
        <div class="row"><label>Swirl</label><input type="range" id="rng-nebula-swirl" min="0.5" max="3.0" step="0.05" value="1.60"><span id="val-nebula-swirl" class="muted">1.60</span></div>
      </details>
      <details open>
        <summary>Aurora</summary>
        <div class="row"><label>Strength</label><input type="range" id="rng-aurora-strength" min="0" max="2" step="0.01" value="1.00"><span id="val-aurora-strength" class="muted">1.00</span></div>
      </details>
      <details open>
        <summary>Lens</summary>
        <div class="row"><label>Radius (px)</label><input type="range" id="rng-lens-radius" min="50" max="600" step="1" value="200"><span id="val-lens-radius" class="muted">200</span></div>
        <div class="row"><label>Zoom</label><input type="range" id="rng-lens-zoom" min="1" max="2" step="0.01" value="1.25"><span id="val-lens-zoom" class="muted">1.25</span></div>
        <div class="row"><label>Dispersion</label><input type="range" id="rng-lens-dispersion" min="0" max="1" step="0.01" value="0.35"><span id="val-lens-dispersion" class="muted">0.35</span></div>
      </details>
      <details id="grp-glass" open>
        <summary>Glass effects</summary>
        <div class="row"><label>Bloom strength</label><input type="range" id="rng-bloom-strength" min="0" max="2" step="0.01" value="0.60"><span id="val-bloom-strength" class="muted">0.60</span></div>
        <div class="row"><label>Bloom threshold</label><input type="range" id="rng-bloom-threshold" min="0" max="1" step="0.01" value="0.70"><span id="val-bloom-threshold" class="muted">0.70</span></div>
        <div class="row"><label>Bloom radius (px)</label><input type="range" id="rng-bloom-radius" min="0" max="32" step="1" value="8"><span id="val-bloom-radius" class="muted">8</span></div>
        <div class="row"><label>Streak strength</label><input type="range" id="rng-streak-strength" min="0" max="2" step="0.01" value="0.80"><span id="val-streak-strength" class="muted">0.80</span></div>
        <div class="row"><label>Streak length (px)</label><input type="range" id="rng-streak-length" min="0" max="400" step="1" value="120"><span id="val-streak-length" class="muted">120</span></div>
        <div class="row"><label>Streak angle (deg)</label><input type="range" id="rng-streak-angle" min="-45" max="45" step="1" value="0"><span id="val-streak-angle" class="muted">0</span></div>
      </details>
      <details id="grp-bh" open>
        <summary>Black hole</summary>
        <div class="row"><label>Mass</label><input type="range" id="rng-bh-mass" min="0.1" max="3.0" step="0.01" value="1.0"><span id="val-bh-mass" class="muted">1.00</span></div>
        <div class="row"><label>Spin</label><input type="range" id="rng-bh-spin" min="0.0" max="1.0" step="0.01" value="0.70"><span id="val-bh-spin" class="muted">0.70</span></div>
      </details>
      </div>
    `;
  }

  #bindControls() {
    if (!this.#controls) return;
    const $ = (sel: string) => this.#controls!.querySelector(sel) as HTMLElement | null;
    const getNum = (id: string) => parseFloat((this.#controls!.querySelector(id) as HTMLInputElement).value);
    const setText = (id: string, text: string) => { const el = $(id); if (el) el.textContent = text; };

    // Initialize from current attributes
    const initBool = (id: string, attr: string, def: boolean) => {
      const el = this.#controls!.querySelector(id) as HTMLInputElement;
      const vAttr = this.getAttribute(attr);
      el.checked = vAttr != null ? vAttr !== 'false' : def;
    };
    const initNum = (id: string, attr: string, def: number, fmt?: (n: number)=>string) => {
      const el = this.#controls!.querySelector(id) as HTMLInputElement;
      const vAttr = this.getAttribute(attr);
      const v = vAttr != null ? parseFloat(vAttr) : def;
      el.valueAsNumber = v;
      if (fmt) setText(id.replace('rng','val'), fmt(v)); else setText(id.replace('rng','val'), String(v.toFixed(2)));
    };
    const initSel = (id: string, attr: string, def: string) => {
      const el = this.#controls!.querySelector(id) as HTMLSelectElement;
      const vAttr = this.getAttribute(attr);
      el.value = (vAttr ?? def);
    };

    initBool('#chk-stars', 'show-stars', true);
    initBool('#chk-galaxy', 'show-galaxy', true);
    initBool('#chk-nebula', 'show-nebula', true);
    initBool('#chk-aurora', 'show-aurora', false);
    initBool('#chk-lens', 'lens-enabled', true);
    initBool('#chk-bh', 'bh-enabled', false);
    initBool('#chk-shooting-vis', 'shooting-enabled', true);

    initNum('#rng-exposure', 'exposure', 0, (n)=>n.toFixed(1));
    initNum('#rng-star-count', 'star-count', 30000, (n)=>n.toFixed(0));
    initNum('#rng-star-intensity', 'star-intensity', 1.0, (n)=>n.toFixed(2));
    initNum('#rng-twinkle-speed', 'twinkle-speed', 0.12, (n)=>n.toFixed(2));
    initNum('#rng-twinkle-amount', 'twinkle-amount', 0.25, (n)=>n.toFixed(2));
    initNum('#rng-shooting-rate', 'shooting-rate', 8, (n)=>n.toFixed(0));
    initNum('#rng-shooting-speed', 'shooting-speed', 500, (n)=>n.toFixed(0));
    initNum('#rng-shooting-length', 'shooting-length', 180, (n)=>n.toFixed(0));
    initNum('#rng-shooting-width', 'shooting-width', 2, (n)=>n.toFixed(0));
    initNum('#rng-shooting-brightness', 'shooting-brightness', 1.5, (n)=>n.toFixed(1));
    initNum('#rng-aurora-strength', 'aurora-strength', 1.0, (n)=>n.toFixed(2));
    initNum('#rng-nebula-density', 'nebula-density', 0.5, (n)=>n.toFixed(2));
    initNum('#rng-nebula-g', 'nebula-g', 0.2, (n)=>n.toFixed(2));
    initNum('#rng-nebula-vibrancy', 'nebula-vibrancy', 1.0, (n)=>n.toFixed(2));
    initNum('#rng-nebula-flow-speed', 'nebula-flow-speed', 0.38, (n)=>n.toFixed(2));
    initNum('#rng-nebula-flow-amp', 'nebula-flow-amp', 0.14, (n)=>n.toFixed(2));
    initNum('#rng-nebula-swirl', 'nebula-swirl', 1.6, (n)=>n.toFixed(2));
    initNum('#rng-lens-radius', 'lens-radius', 200, (n)=>n.toFixed(0));
    initNum('#rng-lens-zoom', 'lens-zoom', 1.25, (n)=>n.toFixed(2));
    initNum('#rng-lens-dispersion', 'lens-dispersion', 0.35, (n)=>n.toFixed(2));
    initNum('#rng-bloom-strength', 'lens-bloom-strength', 0.6, (n)=>n.toFixed(2));
    initNum('#rng-bloom-threshold', 'lens-bloom-threshold', 0.7, (n)=>n.toFixed(2));
    initNum('#rng-bloom-radius', 'lens-bloom-radius', 8, (n)=>n.toFixed(0));
    initNum('#rng-streak-strength', 'lens-streak-strength', 0.8, (n)=>n.toFixed(2));
    initNum('#rng-streak-length', 'lens-streak-length', 120, (n)=>n.toFixed(0));
    initNum('#rng-streak-angle', 'lens-streak-angle', 0, (n)=>n.toFixed(0));
    initNum('#rng-bh-mass', 'bh-mass', 1.0, (n)=>n.toFixed(2));
    initNum('#rng-bh-spin', 'bh-spin', 0.7, (n)=>n.toFixed(2));

    // Wire events
    (this.#controls!.querySelector('#chk-stars') as HTMLInputElement).addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).checked; this.setAttribute('show-stars', String(v));
    });
    (this.#controls!.querySelector('#chk-galaxy') as HTMLInputElement).addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).checked; this.setAttribute('show-galaxy', String(v));
    });
    (this.#controls!.querySelector('#chk-nebula') as HTMLInputElement).addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).checked; this.setAttribute('show-nebula', String(v));
    });
    (this.#controls!.querySelector('#chk-aurora') as HTMLInputElement).addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).checked; this.setAttribute('show-aurora', String(v));
    });
    (this.#controls!.querySelector('#chk-lens') as HTMLInputElement).addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).checked; this.setAttribute('lens-enabled', String(v));
    });
    (this.#controls!.querySelector('#chk-bh') as HTMLInputElement).addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).checked; this.setAttribute('bh-enabled', String(v));
    });
    (this.#controls!.querySelector('#chk-shooting-vis') as HTMLInputElement).addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).checked; this.setAttribute('shooting-enabled', String(v));
    });
    // Nebula sliders
    const bindRange = (rngId: string, attr: string, fmt: (n: number)=>string = (n)=>n.toFixed(2)) => {
      const el = this.#controls!.querySelector(rngId) as HTMLInputElement;
      el.addEventListener('input', (e) => {
        const val = (e.target as HTMLInputElement).valueAsNumber; this.setAttribute(attr, String(val)); setText(rngId.replace('rng','val'), fmt(val));
      });
    };
    bindRange('#rng-nebula-density', 'nebula-density', (n)=>n.toFixed(2));
    bindRange('#rng-nebula-g', 'nebula-g', (n)=>n.toFixed(2));
    bindRange('#rng-nebula-vibrancy', 'nebula-vibrancy', (n)=>n.toFixed(2));
    bindRange('#rng-nebula-flow-speed', 'nebula-flow-speed');
    bindRange('#rng-nebula-flow-amp', 'nebula-flow-amp');
    bindRange('#rng-nebula-swirl', 'nebula-swirl');

    (this.#controls!.querySelector('#rng-exposure') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-exposure', v.toFixed(1)); this.setAttribute('exposure', String(v));
    });
    (this.#controls!.querySelector('#rng-star-count') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-star-count', v.toFixed(0)); this.setAttribute('star-count', String(v));
    });
    (this.#controls!.querySelector('#rng-star-intensity') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-star-intensity', v.toFixed(2)); this.setAttribute('star-intensity', String(v));
    });
    (this.#controls!.querySelector('#rng-twinkle-speed') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-twinkle-speed', v.toFixed(2)); this.setAttribute('twinkle-speed', String(v));
    });
    (this.#controls!.querySelector('#rng-twinkle-amount') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-twinkle-amount', v.toFixed(2)); this.setAttribute('twinkle-amount', String(v));
    });
    (this.#controls!.querySelector('#rng-aurora-strength') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-aurora-strength', v.toFixed(2)); this.setAttribute('aurora-strength', String(v));
    });
    (this.#controls!.querySelector('#rng-nebula-density') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-nebula-density', v.toFixed(2)); this.setAttribute('nebula-density', String(v));
    });
    (this.#controls!.querySelector('#rng-nebula-g') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-nebula-g', v.toFixed(2)); this.setAttribute('nebula-g', String(v));
    });
    (this.#controls!.querySelector('#rng-nebula-vibrancy') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-nebula-vibrancy', v.toFixed(2)); this.setAttribute('nebula-vibrancy', String(v));
    });

    (this.#controls!.querySelector('#rng-lens-radius') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-lens-radius', v.toFixed(0)); this.setAttribute('lens-radius', String(v));
    });
    (this.#controls!.querySelector('#rng-lens-zoom') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-lens-zoom', v.toFixed(2)); this.setAttribute('lens-zoom', String(v));
    });
    (this.#controls!.querySelector('#rng-lens-dispersion') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-lens-dispersion', v.toFixed(2)); this.setAttribute('lens-dispersion', String(v));
    });

    (this.#controls!.querySelector('#rng-bloom-strength') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-bloom-strength', v.toFixed(2)); this.setAttribute('lens-bloom-strength', String(v));
    });
    (this.#controls!.querySelector('#rng-bloom-threshold') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-bloom-threshold', v.toFixed(2)); this.setAttribute('lens-bloom-threshold', String(v));
    });
    (this.#controls!.querySelector('#rng-bloom-radius') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-bloom-radius', v.toFixed(0)); this.setAttribute('lens-bloom-radius', String(v));
    });
    (this.#controls!.querySelector('#rng-streak-strength') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-streak-strength', v.toFixed(2)); this.setAttribute('lens-streak-strength', String(v));
    });
    (this.#controls!.querySelector('#rng-streak-length') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-streak-length', v.toFixed(0)); this.setAttribute('lens-streak-length', String(v));
    });
    (this.#controls!.querySelector('#rng-streak-angle') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-streak-angle', v.toFixed(0)); this.setAttribute('lens-streak-angle', String(v));
    });

    (this.#controls!.querySelector('#rng-shooting-rate') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-shooting-rate', v.toFixed(0)); this.setAttribute('shooting-rate', String(v));
    });
    (this.#controls!.querySelector('#rng-shooting-speed') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-shooting-speed', v.toFixed(0)); this.setAttribute('shooting-speed', String(v));
    });
    (this.#controls!.querySelector('#rng-shooting-length') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-shooting-length', v.toFixed(0)); this.setAttribute('shooting-length', String(v));
    });
    (this.#controls!.querySelector('#rng-shooting-width') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-shooting-width', v.toFixed(0)); this.setAttribute('shooting-width', String(v));
    });
    (this.#controls!.querySelector('#rng-shooting-brightness') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-shooting-brightness', v.toFixed(1)); this.setAttribute('shooting-brightness', String(v));
    });

    (this.#controls!.querySelector('#rng-bh-mass') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-bh-mass', v.toFixed(2)); this.setAttribute('bh-mass', String(v));
    });
    (this.#controls!.querySelector('#rng-bh-spin') as HTMLInputElement).addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).valueAsNumber; setText('#val-bh-spin', v.toFixed(2)); this.setAttribute('bh-spin', String(v));
    });
  }

  #setupControlsMovable() {
    const controls = this.#controls!;
    const toggle = this.#toggleBtn!;
    const header = controls.querySelector('#ctrl-header') as HTMLElement | null;
    const collapseBtn = controls.querySelector('#btn-collapse') as HTMLButtonElement | null;
    const storageKey = this.#storageKey;

    const saveState = () => {
      try {
        const state = { x: Math.round(this.#controlsPosX), y: Math.round(this.#controlsPosY), collapsed: this.#controlsCollapsed };
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {}
    };

    const clampToBounds = (x: number, y: number, el: HTMLElement) => {
      const hostRect = this.#wrap.getBoundingClientRect();
      const w = Math.max(1, el.offsetWidth);
      const h = Math.max(1, el.offsetHeight);
      const maxX = Math.max(0, hostRect.width - w);
      const maxY = Math.max(0, hostRect.height - h);
      const cx = Math.max(0, Math.min(x, maxX));
      const cy = Math.max(0, Math.min(y, maxY));
      return { x: cx, y: cy };
    };

    const applyPos = (el: HTMLElement, x: number, y: number) => {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };

    // Collapse/expand logic
    const collapse = () => {
      this.#controlsCollapsed = true;
      controls.style.display = 'none';
      toggle.style.display = 'flex';
      // Clamp to bounds for the toggle button
      const pos = clampToBounds(this.#controlsPosX, this.#controlsPosY, toggle);
      this.#controlsPosX = pos.x; this.#controlsPosY = pos.y;
      applyPos(toggle, pos.x, pos.y);
      saveState();
    };
    const expand = () => {
      this.#controlsCollapsed = false;
      toggle.style.display = 'none';
      controls.style.display = '';
      // Clamp to bounds for the full panel
      const pos = clampToBounds(this.#controlsPosX, this.#controlsPosY, controls);
      this.#controlsPosX = pos.x; this.#controlsPosY = pos.y;
      applyPos(controls, pos.x, pos.y);
      saveState();
    };

    // Restore persisted state (default collapsed if nothing stored)
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          if (Number.isFinite(saved.x)) this.#controlsPosX = saved.x;
          if (Number.isFinite(saved.y)) this.#controlsPosY = saved.y;
          this.#controlsCollapsed = !!saved.collapsed;
        }
      }
    } catch {}

    if (this.#controlsCollapsed) collapse(); else expand();

    collapseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      collapse();
    });

    // Drag panel via header
    if (header) {
      header.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement).id === 'btn-collapse') return; // don't start drag from the collapse button
        if (e.button !== 0) return;
        this.#ctrlDragging = true;
        controls.classList.add('dragging');
        const hostRect = this.#wrap.getBoundingClientRect();
        this.#ctrlDragOffsetX = e.clientX - hostRect.left - this.#controlsPosX;
        this.#ctrlDragOffsetY = e.clientY - hostRect.top - this.#controlsPosY;
        header.setPointerCapture(e.pointerId);
      });
      header.addEventListener('pointermove', (e) => {
        if (!this.#ctrlDragging) return;
        const hostRect = this.#wrap.getBoundingClientRect();
        const x = e.clientX - hostRect.left - this.#ctrlDragOffsetX;
        const y = e.clientY - hostRect.top - this.#ctrlDragOffsetY;
        const pos = clampToBounds(x, y, controls);
        this.#controlsPosX = pos.x;
        this.#controlsPosY = pos.y;
        applyPos(controls, pos.x, pos.y);
      });
      const endCtrlDrag = (e: PointerEvent) => {
        if (!this.#ctrlDragging) return;
        this.#ctrlDragging = false;
        controls.classList.remove('dragging');
        saveState();
        try { header.releasePointerCapture(e.pointerId); } catch {}
      };
      header.addEventListener('pointerup', endCtrlDrag);
      header.addEventListener('pointercancel', endCtrlDrag);
      header.addEventListener('pointerleave', endCtrlDrag);
    }

    // Drag collapsed toggle button
    let toggleWasDragged = false;
    toggle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.#toggleDragging = true;
      toggle.classList.add('dragging');
      toggleWasDragged = false;
      const hostRect = this.#wrap.getBoundingClientRect();
      this.#toggleDragOffsetX = e.clientX - hostRect.left - this.#controlsPosX;
      this.#toggleDragOffsetY = e.clientY - hostRect.top - this.#controlsPosY;
      toggle.setPointerCapture(e.pointerId);
    });
    toggle.addEventListener('pointermove', (e) => {
      if (!this.#toggleDragging) return;
      const hostRect = this.#wrap.getBoundingClientRect();
      const x = e.clientX - hostRect.left - this.#toggleDragOffsetX;
      const y = e.clientY - hostRect.top - this.#toggleDragOffsetY;
      const pos = clampToBounds(x, y, toggle);
      if (Math.abs(pos.x - this.#controlsPosX) > 2 || Math.abs(pos.y - this.#controlsPosY) > 2) toggleWasDragged = true;
      this.#controlsPosX = pos.x;
      this.#controlsPosY = pos.y;
      applyPos(toggle, pos.x, pos.y);
    });
    const endToggleDrag = (e: PointerEvent) => {
      if (!this.#toggleDragging) return;
      this.#toggleDragging = false;
      toggle.classList.remove('dragging');
      saveState();
      try { toggle.releasePointerCapture(e.pointerId); } catch {}
    };
    toggle.addEventListener('pointerup', endToggleDrag);
    toggle.addEventListener('pointercancel', endToggleDrag);
    toggle.addEventListener('pointerleave', endToggleDrag);

    toggle.addEventListener('click', (e) => {
      if (toggleWasDragged) { e.preventDefault(); e.stopPropagation(); return; }
      expand();
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'abyss-veil': AbyssVeilElement;
  }
}

customElements.define('abyss-veil', AbyssVeilElement);
