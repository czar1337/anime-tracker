// The per-launch write token the server injects into index.html (see
// httpSecurity.js). Every non-GET request to this app's own server must carry it;
// a page in another tab cannot read it, which is what makes it a CSRF defence.
export const WRITE_TOKEN_HEADER = 'x-anime-tracker-token';

let cached = null;

export function writeToken() {
  if (cached === null) {
    cached = globalThis.document?.querySelector('meta[name="anime-tracker-token"]')?.content || '';
  }
  return cached;
}

// Headers for a JSON write to this app's own server.
export function writeHeaders(extra = {}) {
  return { 'Content-Type': 'application/json', [WRITE_TOKEN_HEADER]: writeToken(), ...extra };
}
