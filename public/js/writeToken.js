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

// The server makes a new token every time it starts. A tab left open across a
// restart holds the old one, and without this every save would be refused while
// the page kept saying "your changes are kept here until the save succeeds".
// The token is re-read from the server's own page (a same-origin GET, which the
// Host check already guards), once.
export async function refreshWriteToken() {
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text();
    const match = /<meta name="anime-tracker-token" content="([0-9a-f]+)">/.exec(html);
    if (!match) return false;
    cached = match[1];
    return true;
  } catch {
    return false;
  }
}

// fetch() for a write: sends the current token and, if the server says the token
// is wrong, refreshes it and tries once more. The If-Match check on the library
// still guards against overwriting a newer save.
export async function writeFetch(url, init = {}) {
  const send = () => fetch(url, { ...init, headers: { ...(init.headers || {}), [WRITE_TOKEN_HEADER]: writeToken() } });
  let res = await send();
  if (res.status === 403) {
    const body = await res.clone().json().catch(() => ({}));
    if (body.badToken && (await refreshWriteToken())) res = await send();
  }
  return res;
}
