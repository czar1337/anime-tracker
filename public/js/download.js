'use strict';
// Shared Blob -> <a download> trigger, extracted from the idiom that was
// copy-pasted three times before this one (backupClient.js's
// downloadExport, and two spots in events.js's backup/stats-share overlay
// binders) — P4.4's export-selection buttons are the fourth call site,
// which is what made pulling it out worth doing.
export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
