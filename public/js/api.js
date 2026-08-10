// All network I/O: local server calls (library CRUD, backups, cover
// downloads) and direct-to-AniList GraphQL search (AniList's endpoint sends
// permissive CORS headers, so the browser can call it without a proxy).

const ANILIST_URL = 'https://graphql.anilist.co';

// Returns { data, etag } — `etag` (P1.2's concurrency reframe) is the value
// callers must feed back into saveLibrary()'s If-Match so a stale write gets
// caught rather than silently overwriting whatever another tab saved since.
async function getLibrary() {
  const res = await fetch('/api/library');
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body.error || 'Failed to load library');
    err.corrupt = res.status === 409 && !body.dataConflict && !body.tooNew;
    err.dataConflict = Boolean(body.dataConflict);
    err.oldDir = body.oldDir;
    err.newDir = body.newDir;
    err.tooNew = Boolean(body.tooNew);
    err.dataVersion = body.dataVersion;
    err.appVersion = body.appVersion;
    err.detail = body.detail;
    err.backups = body.backups;
    throw err;
  }
  return { data: body, etag: res.headers.get('ETag') };
}

async function getVersionInfo() {
  const res = await fetch('/api/version');
  if (!res.ok) throw new Error('Failed to check version');
  return res.json();
}

// `etag` is required: the server rejects a PUT with no If-Match header
// (P1.2's concurrency reframe). A 409 with `err.conflict` means another tab
// or window saved changes since this one last loaded/saved — not that
// library.json itself is corrupt (that's still a 409, but without
// `conflict` set, per server.js's own distinction between the two cases).
// Flushes a batch of events (P1.5). Deliberately separate from saveLibrary:
// this endpoint carries no If-Match and can never 409, so an event can never be
// lost to a library conflict — see server.js's event-log section for why that
// decoupling matters. Also usable during page teardown via `keepalive`.
async function postEvents(events, { keepalive = false } = {}) {
  const res = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
    keepalive,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to record events');
  return body;
}

async function saveLibrary(data, etag) {
  const res = await fetch('/api/library', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': etag },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body.error || 'Failed to save library');
    err.conflict = Boolean(body.conflict);
    err.corrupt = res.status === 409 && !err.conflict;
    err.locked = res.status === 423;
    err.currentETag = body.currentETag;
    err.backups = body.backups;
    throw err;
  }
  return { ...body, etag: res.headers.get('ETag') };
}

async function listBackups() {
  const res = await fetch('/api/backups');
  return res.json();
}

async function restoreBackup(file) {
  const res = await fetch('/api/backups/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Restore failed');
  return { ...body, etag: res.headers.get('ETag') };
}

async function getRecommendationsCache() {
  const res = await fetch('/api/recommendations');
  return res.json();
}

async function saveRecommendationsCache(data) {
  const res = await fetch('/api/recommendations', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body.error || 'Failed to save recommendations cache');
    // P1.6: 507 is P1.2's disk-quota refusal. Flagged the same way conflict/
    // locked already are, so callers can surface it instead of swallowing it —
    // rule 5's "never silently drop a write".
    err.quotaExceeded = res.status === 507;
    throw err;
  }
  return body;
}

async function getAiringCache() {
  const res = await fetch('/api/airing');
  return res.json();
}

async function saveAiringCache(data) {
  const res = await fetch('/api/airing', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body.error || 'Failed to save airing cache');
    // P1.6: 507 is P1.2's disk-quota refusal. Flagged the same way conflict/
    // locked already are, so callers can surface it instead of swallowing it —
    // rule 5's "never silently drop a write".
    err.quotaExceeded = res.status === 507;
    throw err;
  }
  return body;
}

async function getUpcomingCache() {
  const res = await fetch('/api/upcoming');
  return res.json();
}

async function saveUpcomingCache(data) {
  const res = await fetch('/api/upcoming', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body.error || 'Failed to save upcoming cache');
    // P1.6: 507 is P1.2's disk-quota refusal. Flagged the same way conflict/
    // locked already are, so callers can surface it instead of swallowing it —
    // rule 5's "never silently drop a write".
    err.quotaExceeded = res.status === 507;
    throw err;
  }
  return body;
}

// Lightweight — `{cursor, entryCount, targetSize, generatedAt}`, never the
// full entries blob. corpus.js polls this on every boot to decide whether a
// seed needs to resume; at a few thousand entries the full cache is
// multi-MB, so a boot-time resume check must not pull that whole blob just
// to read one small object's worth of state.
async function getCorpusStatus() {
  const res = await fetch('/api/corpus/status');
  return res.json();
}

// The full corpus — every pruned entry. Not used by this substep's own seed
// loop (which only ever needs the lightweight status above); this is the
// read path for whichever future substep (P5A.2 onward) scores against it.
async function getCorpusCache() {
  const res = await fetch('/api/corpus');
  return res.json();
}

// Deliberately NOT the same "PUT replaces the whole blob" shape
// saveAiringCache/saveUpcomingCache use — those caches are small enough
// that resending everything on every write is free; the corpus reaches
// several MB by the end of a seed, and resending the whole accumulated
// blob on every single page (60+ times for the default 3,000-title target)
// would mean the LAST page's write body is as large as the entire corpus
// for the sake of ~90KB of genuinely new data. The server merges
// `newEntries` into its own on-disk copy instead — see server.js's
// `PUT /api/corpus` handler.
async function saveCorpusPage({ cursor, newEntries, targetSize }) {
  const res = await fetch('/api/corpus', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cursor, newEntries, targetSize, generatedAt: new Date().toISOString() }),
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body.error || 'Failed to save corpus page');
    err.quotaExceeded = res.status === 507;
    throw err;
  }
  return body;
}

// P5A.2's taste profile — server-computed (it only ever needs the library,
// the corpus cache, and the event log, all of which server.js already has
// direct disk access to; unlike the corpus itself, nothing here needs the
// browser's own AniList reach), so the client side is just this one read.
async function getTasteProfile() {
  const res = await fetch('/api/taste-profile');
  return res.json();
}

async function downloadCover(anilistId, url) {
  const res = await fetch('/api/covers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anilistId, url }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Cover download failed');
  return body.file;
}

// The set of anilistIds that actually have a cover file on disk right now —
// not to be confused with which entries merely *have a coverFile field set*.
async function getExistingCoverIds() {
  const res = await fetch('/api/covers/existing');
  if (!res.ok) throw new Error('Could not check which covers exist');
  const body = await res.json();
  return body.ids;
}

const RELATIONS_FIELD = `
      relations {
        edges {
          relationType
          node { id type }
        }
      }`;

const SEARCH_QUERY = `
query ($search: String) {
  Page(page: 1, perPage: 20) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      idMal
      title { romaji english }
      coverImage { large extraLarge }
      episodes
      duration
      format
      seasonYear
      averageScore
      popularity
      genres
      status
      season
      studios(isMain: true) { nodes { name } }
      ${RELATIONS_FIELD}
    }
  }
}`;

const BATCH_BY_IDMAL_QUERY = `
query ($idMalIn: [Int]) {
  Page(page: 1, perPage: 50) {
    media(idMal_in: $idMalIn, type: ANIME) {
      id
      idMal
      title { romaji english }
      coverImage { large extraLarge }
      episodes
      duration
      format
      seasonYear
      averageScore
      popularity
      genres
      status
      season
      studios(isMain: true) { nodes { name } }
      ${RELATIONS_FIELD}
    }
  }
}`;

// Relation types that represent "the same title" for grouping seasons/OVAs
// together (excludes SOURCE material, ADAPTATION, SPIN_OFF, CHARACTER, etc.
// which are meaningfully different works).
const GROUPING_RELATIONS = new Set(['PREQUEL', 'SEQUEL', 'SIDE_STORY', 'PARENT']);

function extractRelatedIds(media) {
  const edges = media.relations?.edges || [];
  return edges
    .filter((e) => e.node.type === 'ANIME' && GROUPING_RELATIONS.has(e.relationType))
    .map((e) => e.node.id);
}

// The main studio only (isMain:true, requested in every query that feeds
// this) — a title's secondary/production-committee studios aren't useful
// for a filter, just the one people actually mean by "which studio made this".
function extractStudio(media) {
  return media.studios?.nodes?.[0]?.name || null;
}

// AniList's `large` (~230px wide) looks visibly blurry once upscaled into a
// big display spot (the detail overlay's cover panel, the Watching hero
// banner) — `extraLarge` is the actual high-res upload when AniList has one,
// falling back to the same file `large` would have served when it doesn't.
function bestCoverUrl(media) {
  return media.coverImage?.extraLarge || media.coverImage?.large || null;
}

class RateLimitError extends Error {
  constructor(retryAfterSeconds) {
    super('AniList rate limit reached — please wait a moment and try again.');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const ANILIST_TIMEOUT_MS = 15000;

async function anilistRequest(query, variables) {
  let res;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANILIST_TIMEOUT_MS);
  try {
    res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch (err) {
    // Without this, a request AniList never responds to (rare, but not
    // impossible) would hang forever — whatever awaited it, including a
    // background boot-time refresh, would just never resolve.
    if (err.name === 'AbortError') throw new Error('AniList took too long to respond. Try again.');
    throw new Error('Could not reach AniList. Check your internet connection.');
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After')) || 60;
    throw new RateLimitError(retryAfter);
  }
  const body = await res.json();
  if (!res.ok || body.errors) {
    const message = body.errors?.[0]?.message || `AniList request failed (${res.status})`;
    throw new Error(message);
  }
  return body.data;
}

async function searchAniList(search) {
  if (!search || !search.trim()) return [];
  const data = await anilistRequest(SEARCH_QUERY, { search });
  return data.Page.media;
}

async function fetchAniListByMalIds(idMalIn) {
  if (idMalIn.length === 0) return [];
  const data = await anilistRequest(BATCH_BY_IDMAL_QUERY, { idMalIn });
  return data.Page.media;
}

const AIRING_BATCH_QUERY = `
query ($idIn: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $idIn, type: ANIME) {
      id
      status
      episodes
      nextAiringEpisode { episode airingAt }
    }
  }
}`;

async function fetchAiringBatch(idIn) {
  if (idIn.length === 0) return [];
  const data = await anilistRequest(AIRING_BATCH_QUERY, { idIn });
  return data.Page.media;
}

// Sorted by popularity (not by date) so the pool is anticipated, known
// titles rather than obscure not-yet-announced-in-detail entries — the
// Schedule tab re-sorts this pool by taste + release date itself.
const UPCOMING_QUERY = `
query ($page: Int) {
  Page(page: $page, perPage: 50) {
    media(status: NOT_YET_RELEASED, type: ANIME, sort: POPULARITY_DESC) {
      id
      title { romaji english }
      coverImage { large extraLarge }
      format
      genres
      seasonYear
      startDate { year month day }
      averageScore
      popularity
      episodes
      duration
      studios(isMain: true) { nodes { name } }
      ${RELATIONS_FIELD}
    }
  }
}`;

async function fetchUpcomingMedia(page = 1) {
  const data = await anilistRequest(UPCOMING_QUERY, { page });
  return data.Page.media;
}

// P5A.1's corpus seed. Field shape is the exact one P0.3 already proved
// live against AniList (docs/v2-discovery-fixtures/anilist/
// CORPUS_QUERY_page1.json — `perPage: 50` confirmed as AniList's real
// ceiling for this shape, not silently capped lower). Sorted by popularity
// descending so the seed's own early pages are exactly the most useful
// (most-recognizable, most affinity-relevant) titles first — if a seed is
// ever interrupted for good, what it already has is the best possible
// partial corpus, not an arbitrary slice. Deliberately omits `coverImage`
// (covers are cached separately) and `idMal` (this app's sole persisted
// external key is `anilistId`) — corpusLogic.js's `pruneMediaFields` drops
// them again defensively even though they're never requested here.
const CORPUS_QUERY = `
query ($page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(type: ANIME, sort: POPULARITY_DESC) {
      id
      title { romaji english }
      format
      status
      season
      seasonYear
      episodes
      duration
      genres
      averageScore
      popularity
      source
      studios(isMain: true) { nodes { name } }
      tags { name category rank }
      staff(perPage: 5) { edges { role node { name { full } } } }
      ${RELATIONS_FIELD}
    }
  }
}`;

async function fetchCorpusPage(page) {
  const data = await anilistRequest(CORPUS_QUERY, { page });
  return { media: data.Page.media, hasNextPage: data.Page.pageInfo.hasNextPage };
}

// Same field shape as CORPUS_QUERY, keyed by id rather than paged by
// popularity — corpus.js's supplemental pass for the spec's "plus all
// currently airing, plus everything in the library" requirement: a title
// the user tracks (however obscure) or that just started airing (too new
// to have accumulated popularity) can legitimately fall outside the
// popularity-sorted pass's cutoff, so it's fetched directly by id instead.
const CORPUS_BY_IDS_QUERY = `
query ($idIn: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $idIn, type: ANIME) {
      id
      title { romaji english }
      format
      status
      season
      seasonYear
      episodes
      duration
      genres
      averageScore
      popularity
      source
      studios(isMain: true) { nodes { name } }
      tags { name category rank }
      staff(perPage: 5) { edges { role node { name { full } } } }
      ${RELATIONS_FIELD}
    }
  }
}`;

async function fetchCorpusByIds(idIn) {
  if (idIn.length === 0) return [];
  const data = await anilistRequest(CORPUS_BY_IDS_QUERY, { idIn });
  return data.Page.media;
}

const COVERS_BATCH_QUERY = `
query ($idIn: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $idIn, type: ANIME) {
      id
      coverImage { large extraLarge }
    }
  }
}`;

// Used to retry entries whose cover was never successfully saved to disk
// (e.g. a large import that flooded the connection) — the original AniList
// cover URL isn't persisted anywhere, so it has to be looked up again by id.
async function fetchCoversBatch(idIn) {
  if (idIn.length === 0) return [];
  const data = await anilistRequest(COVERS_BATCH_QUERY, { idIn });
  return data.Page.media;
}

// AniList's `recommendations` field only exists on a single Media, not on a
// Page/media list query — so multiple seeds are batched into one request
// using GraphQL aliases (m<id>: Media(id: <id>) {...}) instead of variables.
// IDs are always our own numeric anilistId values (never user text), so
// interpolating them into the query string is safe.
function recommendationsBatchQuery(ids, perPage) {
  const parts = ids.map(
    (id) => `
    m${id}: Media(id: ${id}, type: ANIME) {
      id
      recommendations(sort: RATING_DESC, perPage: ${perPage}) {
        edges {
          node {
            rating
            mediaRecommendation {
              id
              title { romaji english }
              coverImage { large extraLarge }
              genres
              averageScore
              popularity
              seasonYear
              season
              format
              episodes
              duration
              status
              studios(isMain: true) { nodes { name } }
              ${RELATIONS_FIELD}
            }
          }
        }
      }
    }`
  );
  return `query { ${parts.join('\n')} }`;
}

async function fetchRecommendationsBatch(ids, perPage = 15) {
  const numericIds = ids.filter((id) => Number.isInteger(id));
  if (numericIds.length === 0) return {};
  const data = await anilistRequest(recommendationsBatchQuery(numericIds, perPage), {});
  return data;
}

// asHtml:false is deliberate — AniList then returns the description as plain
// text (its own lightweight markdown, not HTML), so there's no HTML to
// sanitize before rendering it. It's escaped like any other API string.
const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english native }
    description(asHtml: false)
    coverImage { large extraLarge }
    bannerImage
    genres
    averageScore
    popularity
    favourites
    format
    status
    episodes
    duration
    source
    startDate { year month day }
    endDate { year month day }
    studios(isMain: true) { nodes { name } }
  }
}`;

async function fetchAnimeDetail(anilistId) {
  const data = await anilistRequest(DETAIL_QUERY, { id: anilistId });
  if (!data.Media) throw new Error('Not found on AniList.');
  return data.Media;
}

export const Api = {
  getLibrary,
  saveLibrary,
  postEvents,
  getVersionInfo,
  listBackups,
  restoreBackup,
  downloadCover,
  getExistingCoverIds,
  searchAniList,
  fetchAniListByMalIds,
  fetchRecommendationsBatch,
  getRecommendationsCache,
  saveRecommendationsCache,
  fetchAnimeDetail,
  fetchAiringBatch,
  fetchCoversBatch,
  getAiringCache,
  saveAiringCache,
  fetchUpcomingMedia,
  getUpcomingCache,
  saveUpcomingCache,
  fetchCorpusPage,
  fetchCorpusByIds,
  getCorpusStatus,
  getTasteProfile,
  getCorpusCache,
  saveCorpusPage,
  extractRelatedIds,
  extractStudio,
  bestCoverUrl,
  RateLimitError,
};
