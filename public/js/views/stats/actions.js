// Statistics actions: the shareable stats card (v3 Phase 2: moved from
// events.js).

import { Store } from '../../state.js';
import { EventHistory } from '../../eventHistory.js';
import { computeLibraryStats } from '../../statsLogic.js';
import { drawStatsCard, buildStatsSummaryText, canvasToPngBlob } from '../../statsExport.js';
import { openDialog } from '../../core/dialog.js';

function currentStats() {
  return computeLibraryStats(Store.getEntries(), Store.getCounts(), new Date(), { events: EventHistory.allEvents(), logStartTs: EventHistory.logStartTs() });
}

function setStatus(text) {
  document.getElementById('stats-share-status').textContent = text || '';
}

async function openStatsShareOverlay() {
  openDialog('stats-share-overlay');
  setStatus('');
  const canvas = document.getElementById('stats-share-canvas');
  // Canvas text drawing does not wait for a webfont still loading; waiting
  // here keeps the card from falling back to a generic system font.
  if (document.fonts?.ready) await document.fonts.ready;
  drawStatsCard(canvas, currentStats());
}

export function bindStatsActions() {
  document.getElementById('stats-view').addEventListener('click', (e) => {
    if (e.target.closest('#stats-share-trigger')) openStatsShareOverlay();
  });

  document.getElementById('stats-share-download-btn').addEventListener('click', async () => {
    const canvas = document.getElementById('stats-share-canvas');
    try {
      const blob = await canvasToPngBlob(canvas);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anime-tracker-stats-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatus(`Could not create image: ${err.message}`);
    }
  });

  document.getElementById('stats-share-copy-image-btn').addEventListener('click', async () => {
    const canvas = document.getElementById('stats-share-canvas');
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      setStatus('Your browser does not support copying images — use "Download image" instead.');
      return;
    }
    try {
      const blob = await canvasToPngBlob(canvas);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setStatus('Image copied to clipboard.');
    } catch (err) {
      setStatus(`Could not copy image: ${err.message}`);
    }
  });

  document.getElementById('stats-share-copy-text-btn').addEventListener('click', async () => {
    const text = buildStatsSummaryText(currentStats());
    if (!navigator.clipboard) {
      setStatus('Your browser does not support copying text.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Text copied to clipboard.');
    } catch (err) {
      setStatus(`Could not copy text: ${err.message}`);
    }
  });
}
