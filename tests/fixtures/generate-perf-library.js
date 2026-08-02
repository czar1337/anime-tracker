'use strict';
// Generates tests/fixtures/perf-library-2000.json: a synthetic 2,000-entry
// library shaped exactly like addEntry()'s real entry shape (public/js/state.js),
// used only by scripts/perf.js to measure the Tuning table's "Library list
// render, 2,000 entries" budget. Not real user data. Run with:
//   node tests/fixtures/generate-perf-library.js

const fs = require('node:fs');
const path = require('node:path');

const COUNT = 2000;
const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Romance', 'Sci-Fi', 'Slice of Life'];
const FORMATS = ['TV', 'MOVIE', 'OVA', 'ONA'];

function entryAt(i) {
  const id = 900000 + i;
  return {
    anilistId: id,
    titleRomaji: `Perf Fixture Title ${i}`,
    titleEnglish: `Perf Fixture Title ${i}`,
    coverFile: '',
    format: FORMATS[i % FORMATS.length],
    year: 2010 + (i % 15),
    totalEpisodes: 12 + (i % 13),
    duration: 24,
    genres: [GENRES[i % GENRES.length], GENRES[(i + 3) % GENRES.length]],
    averageScore: 60 + (i % 35),
    studio: `Studio ${i % 20}`,
    airingStatus: 'FINISHED',
    // All entries live on the 'watching' tab, the app's default activeTab,
    // so the perf script's first paint measurement doesn't need to also
    // change preferences to see all 2,000 cards.
    listStatus: 'watching',
    episodesWatched: i % 12,
    myScore: (i % 10) + 1,
    notes: '',
    relatedIds: [],
    addedAt: new Date(2026, 0, 1 + (i % 300)).toISOString(),
    updatedAt: new Date(2026, 0, 1 + (i % 300)).toISOString(),
    completedAt: null,
  };
}

const library = {
  schemaVersion: 4,
  entries: Array.from({ length: COUNT }, (_, i) => entryAt(i)),
  preferences: {
    sort: { watching: 'addedAt', watchlist: 'addedAt', watched: 'completedAt', dropped: 'updatedAt' },
    sortDir: { watching: 'desc', watchlist: 'desc', watched: 'desc', dropped: 'desc' },
    filters: {
      watching: { genres: [], format: '', studio: '', myScoreMin: null, myScoreMax: null, unratedOnly: false },
      watchlist: { genres: [], format: '', studio: '', myScoreMin: null, myScoreMax: null, unratedOnly: false },
      watched: { genres: [], format: '', studio: '', myScoreMin: null, myScoreMax: null, unratedOnly: false },
      dropped: { genres: [], format: '', studio: '', myScoreMin: null, myScoreMax: null, unratedOnly: false },
    },
    activeTab: 'watching',
    discoverExcludedGenres: [],
    discoverIncludedGenres: [],
    discoverFilters: { format: '', studio: '' },
    scheduleFilters: { format: '', studio: '' },
    notifyNewEpisodes: false,
  },
  dismissedItems: [],
};

const outPath = path.join(__dirname, 'perf-library-2000.json');
fs.writeFileSync(outPath, JSON.stringify(library, null, 2));
console.log(`Wrote ${library.entries.length} entries to ${outPath}`);
