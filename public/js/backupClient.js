// Frontend calls to P1.1's new Class C snapshot/export/reset endpoints.
// Mirrors api.js's fetch-wrapper style. Kept separate from api.js since these
// are all data-safety operations rather than library/AniList data flow.

import { copy } from './copy.js';

async function getSnapshots() {
  const res = await fetch('/api/snapshots');
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || copy('backupClient.listFailed'));
  return body.snapshots;
}

async function createSnapshot() {
  const res = await fetch('/api/snapshots', { method: 'POST' });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || copy('backupClient.createFailed'));
  return body;
}

async function restoreSnapshot(file) {
  const res = await fetch('/api/snapshots/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || copy('backupClient.restoreFailed'));
  return body;
}

// Downloads the registry-driven export as a JSON file, same download-trigger
// pattern as the existing export-backup-btn handler in events.js.
async function downloadExport() {
  const res = await fetch('/api/export');
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || copy('backupClient.exportFailed'));
  const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `anime-tracker-data-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function resetEverything(confirmText) {
  const res = await fetch('/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: confirmText }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || copy('backupClient.resetFailed'));
  return body;
}

export const BackupClient = {
  getSnapshots,
  createSnapshot,
  restoreSnapshot,
  downloadExport,
  resetEverything,
};
