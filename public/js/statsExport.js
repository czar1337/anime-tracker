// Draws a shareable "stats card" PNG from computeLibraryStats() output using
// plain Canvas 2D — no chart/screenshot library, matching this app's
// no-dependencies rule.
//
// design/moonlit-shrine-design-system.md's own rule table for this surface:
// colours read from getComputedStyle at draw time (so the image matches
// whichever theme is active, not a fixed brand palette), fonts waited for
// via document.fonts.ready (done by the caller, events.js's
// openStatsShareOverlay), and "no decoration — header glow only, since
// leaves/feathers compress badly in PNG and read as noise."

const CARD_WIDTH = 800;
const CARD_HEIGHT = 900;

// Reads real theme tokens at draw time via getComputedStyle — this is what
// makes the card match the active theme instead of a fixed palette. Every
// value here is a valid CSS colour string (hsl()/color-mix()), which
// Canvas 2D's fillStyle/strokeStyle accept directly, no conversion needed.
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    bgTop: v('--bg-elevated'),
    bgBottom: v('--bg-deep'),
    glow: v('--glow'),
    text: v('--text'),
    textFaint: v('--faint'),
    tileBg: `color-mix(in srgb, ${v('--text')} 4%, transparent)`,
    tileBorder: `color-mix(in srgb, ${v('--text')} 8%, transparent)`,
    accent: v('--accent-lit'),
    chipBg: v('--accent-soft'),
    chipBorder: `color-mix(in srgb, ${v('--accent')} 40%, transparent)`,
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

// Scoped with save/restore so its center-aligned text doesn't leak into
// whatever gets drawn after it (a bare `ctx.textAlign = 'center'` here
// previously bled into every later section, silently center-aligning "Top
// rated" too — invisible for short labels, but it clipped long titles off
// the left edge of the card).
function drawStatTile(ctx, colors, x, y, w, h, value, label) {
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = colors.tileBg;
  ctx.fill();
  ctx.strokeStyle = colors.tileBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colors.text;
  ctx.font = "700 40px 'Zen Old Mincho', Georgia, serif";
  ctx.fillText(value, x + w / 2, y + h / 2 + 4);

  ctx.fillStyle = colors.textFaint;
  ctx.font = "600 13px 'Schibsted Grotesk', sans-serif";
  ctx.fillText(label.toUpperCase(), x + w / 2, y + h / 2 + 30);
  ctx.restore();
}

// Renders the card into `canvas` (resized to CARD_WIDTH x CARD_HEIGHT).
// Callers should wait for document.fonts.ready first for a crisp result —
// canvas text drawing is synchronous and doesn't itself wait on webfont loads.
export function drawStatsCard(canvas, stats) {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  const colors = readColors();

  const bg = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  bg.addColorStop(0, colors.bgTop);
  bg.addColorStop(1, colors.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Single header glow — no leaves/feathers/dual-tone glow in an exported
  // image, per the design rule above.
  const glow = ctx.createRadialGradient(CARD_WIDTH * 0.82, -40, 0, CARD_WIDTH * 0.82, -40, 420);
  glow.addColorStop(0, `color-mix(in srgb, ${colors.glow} 30%, transparent)`);
  glow.addColorStop(1, `color-mix(in srgb, ${colors.glow} 0%, transparent)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_WIDTH, 400);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colors.accent;
  ctx.font = "700 14px 'Schibsted Grotesk', sans-serif";
  ctx.fillText('ANIME TRACKER', 48, 64);

  ctx.fillStyle = colors.text;
  ctx.font = "700 44px 'Zen Old Mincho', Georgia, serif";
  ctx.fillText(`My ${stats.year} in anime`, 48, 118);

  const tiles = [
    [String(stats.totalTitles), 'Titles in library'],
    [String(stats.totalEpisodes), 'Episodes watched'],
    [stats.totalDays.toFixed(1), 'Days watched'],
    [stats.meanScore != null ? stats.meanScore.toFixed(2) : '—', 'Mean score'],
    [String(stats.completedThisYear), `Completed in ${stats.year}`],
    [`${Math.round(stats.dropRate)}%`, 'Drop rate'],
  ];
  const gridTop = 160;
  const tileW = 336;
  const tileH = 130;
  const gap = 24;
  tiles.forEach(([value, label], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    drawStatTile(ctx, colors, 48 + col * (tileW + gap), gridTop + row * (tileH + gap), tileW, tileH, value, label);
  });

  const genresLabelY = gridTop + 3 * (tileH + gap) + 30;
  ctx.fillStyle = colors.textFaint;
  ctx.font = "700 13px 'Schibsted Grotesk', sans-serif";
  ctx.fillText('TOP GENRES', 48, genresLabelY);

  const chipY = genresLabelY + 22;
  ctx.font = "600 16px 'Schibsted Grotesk', sans-serif";
  let chipX = 48;
  for (const genre of stats.topGenres) {
    const chipW = ctx.measureText(genre).width + 32;
    if (chipX + chipW > CARD_WIDTH - 48) break; // a long tail of genres just gets left off one row rather than overflowing the card
    roundRect(ctx, chipX, chipY, chipW, 40, 20);
    ctx.fillStyle = colors.chipBg;
    ctx.fill();
    ctx.strokeStyle = colors.chipBorder;
    ctx.stroke();
    ctx.fillStyle = colors.accent;
    ctx.textBaseline = 'middle';
    ctx.fillText(genre, chipX + 16, chipY + 21);
    ctx.textBaseline = 'alphabetic';
    chipX += chipW + 12;
  }

  if (stats.topRatedTitle) {
    const labelY = chipY + 90;
    ctx.fillStyle = colors.textFaint;
    ctx.font = "700 13px 'Schibsted Grotesk', sans-serif";
    ctx.fillText('TOP RATED', 48, labelY);
    ctx.fillStyle = colors.text;
    ctx.font = "600 20px 'Zen Old Mincho', Georgia, serif";
    ctx.fillText(truncateToWidth(ctx, stats.topRatedTitle, CARD_WIDTH - 96), 48, labelY + 32);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = colors.textFaint;
  ctx.font = "500 13px 'Schibsted Grotesk', sans-serif";
  ctx.fillText('Made with Anime Tracker · a local, no-account anime list', CARD_WIDTH / 2, CARD_HEIGHT - 36);
}

export function buildStatsSummaryText(stats) {
  const lines = [
    `My ${stats.year} in anime — Anime Tracker`,
    `${stats.totalTitles} titles · ${stats.totalEpisodes} episodes watched · ${stats.totalDays.toFixed(1)} days watched`,
    stats.meanScore != null ? `Mean score: ${stats.meanScore.toFixed(2)}` : null,
    `Completed in ${stats.year}: ${stats.completedThisYear}`,
    `Drop rate: ${Math.round(stats.dropRate)}%`,
    stats.topGenres.length ? `Top genres: ${stats.topGenres.join(', ')}` : null,
    stats.topRatedTitle ? `Top rated: ${stats.topRatedTitle}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not render image'))), 'image/png');
  });
}
