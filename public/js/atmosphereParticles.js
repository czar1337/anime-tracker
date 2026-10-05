// The falling and floating particles of the atmosphere layer (v3 run 2,
// Section 5): one canvas, drawn with requestAnimationFrame, for every
// decoration level. Low and Full are calm (a few particles on one or two
// depth layers); Insane is a lot (three layers with parallax on the pointer
// and on scroll, rising embers, more of everything) but each particle stays
// small and soft so the content reads through it.
//
// The kind follows the season: cherry petals in spring, fireflies in summer,
// leaves in autumn, snow in winter (atmosphere.js picks it from the date or
// the Settings override). Colours come from the theme's own tokens.
//
// Budget: at most PARTICLES[level] particles, sprites pre-rendered once per
// kind, the canvas at most 1.5x device pixels, nothing drawn while the window
// is hidden, and when frames run slow (FPS_FLOOR) the count is cut until they
// do not. bursts() are a short spray of sparks from a point (an episode, a
// finished series), on the same canvas.

import { ATMOSPHERE } from '../../config/tuning.js';

const PARTICLES = ATMOSPHERE.particles;
const LAYERS = ATMOSPHERE.layers;
const EMBERS = ATMOSPHERE.embers;
const DEPTH = ATMOSPHERE.depth;
const FPS_FLOOR = ATMOSPHERE.fpsFloor;
const FPS_SAMPLE = ATMOSPHERE.fpsSample;
const MIN_SCALE = ATMOSPHERE.minScale;
const MAX_DPR = ATMOSPHERE.maxDpr;

const rand = (a, b) => a + Math.random() * (b - a);

function token(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// One small canvas per kind and colour, drawn once.
function sprite(kind, color, glow) {
  const size = kind === 'firefly' || kind === 'ember' || kind === 'spark' ? 24 : 32;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const m = size / 2;
  g.translate(m, m);
  if (kind === 'firefly' || kind === 'ember' || kind === 'spark') {
    const r = g.createRadialGradient(0, 0, 0, 0, 0, m);
    r.addColorStop(0, color);
    r.addColorStop(0.25, color);
    r.addColorStop(1, 'transparent');
    g.fillStyle = r;
    g.fillRect(-m, -m, size, size);
  } else if (kind === 'snow') {
    const r = g.createRadialGradient(0, 0, 0, 0, 0, m * 0.55);
    r.addColorStop(0, color);
    r.addColorStop(0.6, color);
    r.addColorStop(1, 'transparent');
    g.fillStyle = r;
    g.beginPath();
    g.arc(0, 0, m * 0.55, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'petal') {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(0, 0, m * 0.42, m * 0.7, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(0, -m * 0.72, m * 0.18, 0, Math.PI * 2);
    g.fill();
  } else {
    // A leaf: two arcs to a point, with a vein.
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, -m * 0.85);
    g.quadraticCurveTo(m * 0.75, -m * 0.1, 0, m * 0.85);
    g.quadraticCurveTo(-m * 0.75, -m * 0.1, 0, -m * 0.85);
    g.fill();
    g.strokeStyle = glow;
    g.globalAlpha = 0.35;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -m * 0.7);
    g.lineTo(0, m * 0.75);
    g.stroke();
  }
  return c;
}

// The season's own colours (blossom pink, autumn reds and ambers, snow,
// firefly gold), so a season looks like itself on every theme; the glow and
// the sparks take the theme's.
const SEASON_COLOURS = {
  petal: ['hsl(345 75% 86%)', 'hsl(338 70% 78%)', 'hsl(352 85% 92%)'],
  leaf: ['hsl(18 78% 52%)', 'hsl(34 85% 56%)', 'hsl(6 66% 46%)', 'hsl(45 80% 58%)'],
  snow: ['hsl(210 40% 97%)', 'hsl(205 45% 90%)'],
  firefly: ['hsl(56 95% 72%)', 'hsl(80 85% 68%)'],
};
function paletteFor(kind) {
  const glow = token('--glow', '#cde');
  return (SEASON_COLOURS[kind] || SEASON_COLOURS.leaf).map((c) => sprite(kind, c, glow));
}

export function createParticleField(canvas) {
  const ctx = canvas.getContext('2d');
  let level = 'off';
  let kind = 'leaf';
  let sprites = [];
  let emberSprite = null;
  let sparkSprites = [];
  let particles = [];
  let embers = [];
  let sparks = [];
  let ambient = false; // the falling/floating field (not the bursts)
  let raf = 0;
  let last = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let scale = 1; // auto scale-down share of the budget
  let frames = [];
  let pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollY = 0;
  const stats = { fps: 0, particles: 0, scale: 1, frames: 0 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  function spawn(p = {}, fromTop = false) {
    const layers = LAYERS[level] || 1;
    const z = p.z ?? Math.floor(Math.random() * layers) + (3 - layers);
    const d = DEPTH[Math.min(2, z)];
    const floats = kind === 'firefly';
    return {
      z,
      x: rand(0, width),
      y: fromTop ? rand(-60, -10) : rand(0, height),
      vx: rand(-12, 12) * d.speed,
      vy: floats ? rand(-6, 6) : rand(18, 42) * d.speed * (kind === 'snow' ? 0.8 : 1),
      rot: rand(0, Math.PI * 2),
      vr: kind === 'snow' || floats ? 0 : rand(-1.2, 1.2),
      size: rand(9, 15) * d.size * (kind === 'snow' ? 0.7 : 1),
      alpha: rand(0.55, 1) * d.alpha,
      phase: rand(0, Math.PI * 2),
      sprite: sprites[Math.floor(Math.random() * sprites.length)],
    };
  }

  function spawnEmber(fromBottom = false) {
    return { x: rand(0, width), y: fromBottom ? height + rand(0, 40) : rand(0, height), vy: rand(-26, -12), vx: rand(-6, 6), size: rand(4, 8), alpha: rand(0.35, 0.8), phase: rand(0, Math.PI * 2) };
  }

  function budget() {
    return Math.max(1, Math.round((PARTICLES[level] || 0) * scale));
  }

  function fill() {
    const want = ambient ? budget() : 0;
    while (particles.length < want) particles.push(spawn());
    if (particles.length > want) particles.length = want;
    const wantEmbers = ambient ? Math.round((EMBERS[level] || 0) * scale) : 0;
    while (embers.length < wantEmbers) embers.push(spawnEmber());
    if (embers.length > wantEmbers) embers.length = wantEmbers;
  }

  // Slow frames cut the budget a step at a time; a long run of fast ones
  // gives a little back.
  function measure(dt) {
    frames.push(dt);
    if (frames.length < FPS_SAMPLE) return;
    const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    frames = [];
    const fps = 1000 / avg;
    stats.fps = Math.round(fps);
    if (fps < FPS_FLOOR && scale > MIN_SCALE) scale = Math.max(MIN_SCALE, scale * ATMOSPHERE.scaleDownStep);
    else if (fps > ATMOSPHERE.fpsRecover && scale < 1) scale = Math.min(1, scale + ATMOSPHERE.scaleUpStep);
    stats.scale = Number(scale.toFixed(2));
    fill();
  }

  function frame(now) {
    raf = 0;
    if (document.hidden) return; // resumed by visibilitychange
    const dt = Math.min(64, last ? now - last : 16);
    last = now;
    stats.frames += 1;
    if (ambient) measure(dt);
    const t = dt / 1000;
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const parallax = level === 'insane';
    for (const p of particles) {
      const d = DEPTH[Math.min(2, p.z)];
      p.phase += t;
      if (kind === 'firefly') {
        p.x += (p.vx + Math.sin(p.phase * 0.7) * 10) * t;
        p.y += (p.vy + Math.cos(p.phase * 0.5) * 8) * t;
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;
      } else {
        p.x += (p.vx + Math.sin(p.phase) * 14 * d.speed) * t;
        p.y += p.vy * t;
        p.rot += p.vr * t;
        if (p.y > height + 40) Object.assign(p, spawn({ z: p.z }, true));
      }
      const ox = parallax ? (pointer.x * d.parallax) : 0;
      const oy = parallax ? (pointer.y * d.parallax) - ((scrollY * d.parallax * 0.01) % height) : 0;
      let y = p.y + oy;
      if (y < -60) y += height + 80;
      const pulse = kind === 'firefly' ? 0.45 + 0.55 * Math.abs(Math.sin(p.phase * 1.3)) : 1;
      ctx.globalAlpha = p.alpha * pulse;
      const s = p.size;
      ctx.setTransform(dpr, 0, 0, dpr, (p.x + ox) * dpr, y * dpr);
      if (p.vr) ctx.rotate(p.rot);
      ctx.drawImage(p.sprite, -s / 2, -s / 2, s, s);
    }
    for (const e of embers) {
      e.phase += t;
      e.x += (e.vx + Math.sin(e.phase * 2) * 6) * t;
      e.y += e.vy * t;
      if (e.y < -20) Object.assign(e, spawnEmber(true));
      ctx.globalAlpha = e.alpha * (0.5 + 0.5 * Math.abs(Math.sin(e.phase * 3)));
      ctx.setTransform(dpr, 0, 0, dpr, e.x * dpr, e.y * dpr);
      ctx.drawImage(emberSprite, -e.size / 2, -e.size / 2, e.size, e.size);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.life -= t;
      if (sp.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      sp.vx *= 0.94;
      sp.vy = sp.vy * 0.94 + sp.gravity * t;
      sp.x += sp.vx * t;
      sp.y += sp.vy * t;
      ctx.globalAlpha = Math.min(1, sp.life / sp.span) * sp.alpha;
      ctx.setTransform(dpr, 0, 0, dpr, sp.x * dpr, sp.y * dpr);
      ctx.drawImage(sp.sprite, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
    }
    ctx.globalAlpha = 1;
    stats.particles = particles.length + embers.length + sparks.length;
    canvas.dataset.particles = String(stats.particles);
    if (ambient || sparks.length) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, width, height);
  }

  function run() {
    if (!raf && !document.hidden) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  const onResize = () => {
    resize();
    fill();
  };
  const onPointer = (e) => {
    pointer.tx = (e.clientX / Math.max(1, width) - 0.5) * 2;
    pointer.ty = (e.clientY / Math.max(1, height) - 0.5) * 2;
  };
  const onScroll = () => {
    scrollY = window.scrollY;
  };
  const onVisibility = () => {
    if (document.hidden) stopLoop();
    else if (ambient || sparks.length) run();
  };
  // Moved to a screen with another pixel density (no resize event): the
  // canvas follows, so it is never blurry or drawn too large.
  let dprQuery = null;
  const onDprChange = () => {
    onResize();
    watchDpr();
  };
  function watchDpr() {
    dprQuery?.removeEventListener('change', onDprChange);
    dprQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`) || null;
    dprQuery?.addEventListener('change', onDprChange);
  }
  const themeSprites = () => {
    emberSprite = sprite('ember', token('--warning', '#db8'), token('--glow', '#cde'));
    sparkSprites = [token('--accent-lit', '#e88'), token('--warning', '#db8'), token('--glow', '#cde')].map((c) => sprite('spark', c, c));
  };
  resize();
  watchDpr();
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  return {
    // level: off | low | full | insane; season kind: petal | firefly | leaf | snow.
    // `falling`: false keeps the canvas for bursts only (light themes).
    configure({ level: nextLevel, kind: nextKind, falling = true }) {
      const changed = nextLevel !== level || nextKind !== kind;
      level = nextLevel;
      kind = nextKind;
      // The sparks and embers take the theme's colours: redrawn on every
      // configure (a theme change calls it too); four tiny canvases.
      themeSprites();
      if (changed || !sprites.length) {
        sprites = paletteFor(kind);
        particles = [];
        embers = [];
        scale = 1;
      }
      ambient = level !== 'off' && falling;
      fill();
      if (ambient) run();
      else if (!sparks.length) {
        stopLoop();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles = [];
        embers = [];
        stats.particles = 0;
        canvas.dataset.particles = '0';
      }
    },
    // A spray of sparks from (x, y): small for an episode, more for a series.
    burst({ x, y, big = false }) {
      if (!sparkSprites.length) themeSprites();
      const room = Math.max(0, ATMOSPHERE.maxSparks - sparks.length);
      const n = Math.min(room, Math.round((big ? ATMOSPHERE.burst.big : ATMOSPHERE.burst.small) * (level === 'insane' ? ATMOSPHERE.burst.insaneFactor : 1)));
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(80, big ? 420 : 240);
        const span = rand(0.6, big ? 1.6 : 0.9);
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (big ? 120 : 40), gravity: big ? 320 : 180, life: span, span, size: rand(8, big ? 18 : 12), alpha: rand(0.7, 1), sprite: sparkSprites[i % sparkSprites.length] });
      }
      run();
    },
    stats: () => ({ ...stats, level, kind, budget: budget() }),
    destroy() {
      stopLoop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      dprQuery?.removeEventListener('change', onDprChange);
    },
  };
}
