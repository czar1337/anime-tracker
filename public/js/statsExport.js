// Draws a shareable "stats card" PNG from computeLibraryStats() output using
// plain Canvas 2D — no chart/screenshot library, matching this app's
// no-dependencies rule. Colors are fixed (not theme-aware) since the card is
// meant to be shared outside the app, where the viewer never sees the
// light/dark toggle anyway.

const CARD_WIDTH = 800;
const CARD_HEIGHT = 900;

const COLORS = {
  bgTop: '#15121f',
  bgBottom: '#1f1a30',
  tealGlow: 'rgba(95,181,163,0.25)',
  pinkGlow: 'rgba(226,143,206,0.2)',
  teal: '#5FB5A3',
  tealStrong: '#86D4C4',
  text: '#f4f3f8',
  textFaint: '#726f88',
  tileBg: 'rgba(255,255,255,0.04)',
  tileBorder: 'rgba(255,255,255,0.08)',
  chipBg: 'rgba(95,181,163,0.16)',
  chipBorder: 'rgba(95,181,163,0.4)',
};

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
function drawStatTile(ctx, x, y, w, h, value, label) {
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = COLORS.tileBg;
  ctx.fill();
  ctx.strokeStyle = COLORS.tileBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 40px Sora, sans-serif";
  ctx.fillText(value, x + w / 2, y + h / 2 + 4);

  ctx.fillStyle = COLORS.textFaint;
  ctx.font = "600 13px Inter, sans-serif";
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

  const bg = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  bg.addColorStop(0, COLORS.bgTop);
  bg.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const glow1 = ctx.createRadialGradient(120, 120, 0, 120, 120, 260);
  glow1.addColorStop(0, COLORS.tealGlow);
  glow1.addColorStop(1, 'rgba(95,181,163,0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, CARD_WIDTH, 400);

  const glow2 = ctx.createRadialGradient(680, 220, 0, 680, 220, 260);
  glow2.addColorStop(0, COLORS.pinkGlow);
  glow2.addColorStop(1, 'rgba(226,143,206,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, CARD_WIDTH, 400);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.textFaint;
  ctx.font = "700 14px Inter, sans-serif";
  ctx.fillText('ANIME TRACKER', 48, 64);

  ctx.fillStyle = COLORS.text;
  ctx.font = "800 44px Sora, sans-serif";
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
    drawStatTile(ctx, 48 + col * (tileW + gap), gridTop + row * (tileH + gap), tileW, tileH, value, label);
  });

  const genresLabelY = gridTop + 3 * (tileH + gap) + 30;
  ctx.fillStyle = COLORS.textFaint;
  ctx.font = "700 13px Inter, sans-serif";
  ctx.fillText('TOP GENRES', 48, genresLabelY);

  const chipY = genresLabelY + 22;
  ctx.font = "600 16px Inter, sans-serif";
  let chipX = 48;
  for (const genre of stats.topGenres) {
    const chipW = ctx.measureText(genre).width + 32;
    if (chipX + chipW > CARD_WIDTH - 48) break; // a long tail of genres just gets left off one row rather than overflowing the card
    roundRect(ctx, chipX, chipY, chipW, 40, 20);
    ctx.fillStyle = COLORS.chipBg;
    ctx.fill();
    ctx.strokeStyle = COLORS.chipBorder;
    ctx.stroke();
    ctx.fillStyle = COLORS.tealStrong;
    ctx.textBaseline = 'middle';
    ctx.fillText(genre, chipX + 16, chipY + 21);
    ctx.textBaseline = 'alphabetic';
    chipX += chipW + 12;
  }

  if (stats.topRatedTitle) {
    const labelY = chipY + 90;
    ctx.fillStyle = COLORS.textFaint;
    ctx.font = "700 13px Inter, sans-serif";
    ctx.fillText('TOP RATED', 48, labelY);
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 20px Sora, sans-serif";
    ctx.fillText(truncateToWidth(ctx, stats.topRatedTitle, CARD_WIDTH - 96), 48, labelY + 32);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.textFaint;
  ctx.font = "500 13px Inter, sans-serif";
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
