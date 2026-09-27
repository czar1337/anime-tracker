// Import sources (v3 Phase 5): each turns its own format into importCore
// items. Pure (no DOM), so the parsers are unit-tested in Node.
//
// MyAnimeList is lossless now: On-Hold becomes Paused (it used to land in
// Watching), and the start and finish dates (partial ones too), the rewatch
// count, a running rewatch and the comments are kept.

import { Api } from './api.js';
import { copy } from './copy.js';

// MAL writes a status name, or in older exports its number.
const MAL_STATUS = {
  Watching: 'watching', 1: 'watching',
  Completed: 'watched', 2: 'watched',
  'On-Hold': 'paused', 3: 'paused',
  Dropped: 'dropped', 4: 'dropped',
  'Plan to Watch': 'watchlist', 6: 'watchlist',
};

// "2015-05-00" (a MAL partial date) -> the first of that month; "2015-00-00"
// -> the first of the year; "0000-00-00" or anything else -> null. Noon UTC,
// so the day is the same in every time zone. v2 threw on a partial date and
// aborted the whole import.
export function parseMalDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!m || m[1] === '0000') return null;
  const year = Number(m[1]);
  const month = Math.min(12, Math.max(1, Number(m[2]) || 1));
  const day = Math.min(31, Math.max(1, Number(m[3]) || 1));
  const t = Date.UTC(year, month - 1, day, 12);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const XML_ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };
function unescapeXml(raw) {
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw.trim());
  if (cdata) return cdata[1].trim();
  return raw.replace(/&(lt|gt|amp|quot|apos);/g, (e) => XML_ENTITIES[e]).trim();
}

// The MAL export, parsed without a DOM (so it is unit-testable in Node). One
// object per <anime>, with every field the library can keep.
export function parseMalXml(xmlText) {
  if (!/<myanimelist[\s>]/i.test(xmlText)) throw new Error(copy('import.error.notMal'));
  const out = [];
  for (const [, body] of xmlText.matchAll(/<anime>([\s\S]*?)<\/anime>/g)) {
    const get = (tag) => {
      const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body);
      return m ? unescapeXml(m[1]) : '';
    };
    const malId = Number(get('series_animedb_id'));
    if (!malId) continue;
    out.push({
      malId,
      title: get('series_title'),
      totalEpisodes: Number(get('series_episodes')) || null,
      episodesWatched: Number(get('my_watched_episodes')) || 0,
      score: Number(get('my_score')) || null,
      malStatus: get('my_status'),
      startedAt: parseMalDate(get('my_start_date')),
      completedAt: parseMalDate(get('my_finish_date')),
      timesWatched: Number(get('my_times_watched')) || 0,
      rewatching: get('my_rewatching') === '1',
      comments: get('my_comments'),
    });
  }
  return out;
}

function mediaPatch(media) {
  return {
    anilistId: media.id,
    titleRomaji: media.title.romaji,
    titleEnglish: media.title.english,
    format: media.format,
    year: media.seasonYear,
    totalEpisodes: media.episodes,
    duration: media.duration,
    genres: media.genres,
    averageScore: media.averageScore,
    popularity: media.popularity ?? null,
    season: media.season || null,
    studio: Api.extractStudio(media),
    airingStatus: media.status || null,
    relatedIds: Api.extractRelatedIds(media),
  };
}

function noteHeading(sourceKey, now = new Date()) {
  return copy(sourceKey, undefined, { date: now.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) });
}

// One MAL row as an importCore item. A running rewatch is Watching.
export function malItem(malEntry, media, now = new Date()) {
  const listStatus = malEntry.rewatching ? 'watching' : MAL_STATUS[malEntry.malStatus] || 'watchlist';
  const fields = {
    listStatus,
    episodesWatched: malEntry.episodesWatched,
    myScore: malEntry.score,
    startedAt: malEntry.startedAt,
    completedAt: malEntry.completedAt,
    rewatchCount: malEntry.timesWatched,
  };
  return {
    anilistId: media.id,
    title: media.title.english || media.title.romaji,
    patch: mediaPatch(media),
    fields,
    notesAppend: malEntry.comments ? `${noteHeading('import.note.mal', now)}\n${malEntry.comments}` : '',
    updatedAt: null, // the export has no per-entry change time
    rewatching: malEntry.rewatching,
    coverUrl: Api.bestCoverUrl(media),
  };
}

const ANILIST_STATUS = { CURRENT: 'watching', PLANNING: 'watchlist', COMPLETED: 'watched', DROPPED: 'dropped', PAUSED: 'paused', REPEATING: 'watching' };

function fuzzyToIso(d) {
  if (!d?.year) return null;
  return new Date(Date.UTC(d.year, (d.month || 1) - 1, d.day || 1, 12)).toISOString();
}

export function anilistItem(entry, now = new Date()) {
  const media = entry.media;
  return {
    anilistId: media.id,
    title: media.title.english || media.title.romaji,
    patch: mediaPatch(media),
    fields: {
      listStatus: ANILIST_STATUS[entry.status] || 'watchlist',
      episodesWatched: Number(entry.progress) || 0,
      myScore: entry.score ? Math.round(Number(entry.score)) || null : null,
      startedAt: fuzzyToIso(entry.startedAt),
      completedAt: fuzzyToIso(entry.completedAt),
      rewatchCount: Number(entry.repeat) || 0,
    },
    notesAppend: entry.notes ? `${noteHeading('import.note.anilist', now)}\n${entry.notes.trim()}` : '',
    updatedAt: Number(entry.updatedAt) ? Number(entry.updatedAt) * 1000 : null,
    rewatching: entry.status === 'REPEATING',
    coverUrl: Api.bestCoverUrl(media),
  };
}

// Backup file

// A library.json, a v2 backup or a v3 export ({ stores: { entries } }).
export function backupItems(data) {
  const entries = Array.isArray(data?.entries) ? data.entries : Array.isArray(data?.stores?.entries) ? data.stores.entries : null;
  if (!entries) throw new Error(copy('import.error.notBackup'));
  return entries
    .filter((e) => e && Number.isInteger(e.anilistId))
    .map((e) => {
      const { listStatus, episodesWatched, myScore, startedAt, completedAt, rewatchCount, notes, ...rest } = e;
      return {
        anilistId: e.anilistId,
        title: e.titleEnglish || e.titleRomaji || '',
        patch: rest,
        fields: { listStatus, episodesWatched, myScore: myScore ?? null, startedAt: startedAt ?? null, completedAt: completedAt ?? null, rewatchCount: rewatchCount ?? 0 },
        notesAppend: typeof notes === 'string' && notes.trim() ? notes.trim() : '',
        updatedAt: Date.parse(e.updatedAt || '') || null,
        rewatching: false,
      };
    });
}
