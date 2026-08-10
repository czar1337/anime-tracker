'use strict';
// P5A.4's pure shelf-building logic: franchise-entry-point resolution,
// franchise collapsing, the diversity cap, and the 4 shelves themselves
// ("Because you liked X", "Finish what you started", "Hidden gems",
// "Short and finishable"). P5B.1 adds 6 more ("Blind spot", "From the
// studio behind...", "From the director of...", "Community classics
// you've missed", "This season, for you", "Ironically essential") —
// the spec's own "rules for all shelves" already made these generic in
// this module (hide-owned, prerequisite-chain, franchise collapse,
// diversity cap, empty-reason text all live in `resolveAndFilter`/
// `rankAndCapShelf`), so P5B.1's own additions are almost entirely new
// filter predicates and reason-text formatters, not new plumbing.
// Shelf 10 ("Your friends loved, you have not seen") has no
// social/list-comparison layer to depend on in this app and is omitted
// per the spec's own instruction — see docs/v2-backlog.md.
// P5B.2 adds mood filters: an optional 11th, session-only `moodShelf`
// computed alongside (never instead of) the 10 named shelves when the
// caller passes `activeMoodId` — matching against moodRegistry.js's
// declarative definitions via moodLogic.js's own matchesMood, reusing
// this module's existing resolveAndFilter/rankAndCapShelf plumbing the
// same way P5B.1's shelves did.
// Operates entirely over corpus-shaped candidates
// (never AniList's raw Media shape recommendLogic.js's older functions
// use) and the taste profile/scorer already built at P5A.2/P5A.3 — no
// fetch, no DOM. discover.js (orchestration: fetching the corpus, the
// taste profile, calling this, rendering the result) is the only real
// consumer.
//
// Why this replaces, not extends, the old seed-based pipeline: with real
// shelves, Discover renders every time from data already on disk — the
// spec's own "zero API requests" budget for a warm corpus is unmeetable by
// a pipeline that calls AniList's live `recommendations` field per seed on
// every refresh. recommendLogic.js itself is NOT deleted (Schedule's own
// "Coming soon" still uses its genreSimilarity), but Discover's own main
// pipeline moves here entirely.

import { resolvePrimaryGenre } from './tasteProfileLogic.js';
import { score } from './scorer.js';
import { matchesMood, isThemeTag } from './moodLogic.js';
import { MOOD_REGISTRY } from './moodRegistry.js';

// Mirrors api.js's own GROUPING_RELATIONS exactly (duplicated rather than
// imported so this module stays fetch-free and independent of api.js) —
// the same "direct continuation of the same story" relation set this app
// already uses to decide which relations count as a single franchise for
// a LIBRARY entry's own relatedIds (extractRelatedIds). Using a different,
// looser set here would make "collapse franchises" disagree with what
// "the same franchise" already means everywhere else in this app.
const FRANCHISE_RELATION_TYPES = ['PREQUEL', 'SEQUEL', 'SIDE_STORY', 'PARENT'];

function franchiseRelations(candidate) {
  return (candidate.relations || []).filter((r) => FRANCHISE_RELATION_TYPES.includes(r.relationType));
}

// Exported so discover.js can populate a new library entry's own
// relatedIds from a CORPUS candidate the exact same way api.js's
// extractRelatedIds already does from a raw AniList Media object — same
// relation-type set, just a different input shape (the corpus's own
// already-flattened `{relationType, relatedId, relatedType}`, not AniList's
// raw `relations.edges`). Restricted to `type === 'ANIME'`, matching
// extractRelatedIds' own guard against linking to a manga/novel source.
function franchiseRelatedIds(candidate) {
  return franchiseRelations(candidate)
    .filter((r) => r.relatedType === 'ANIME')
    .map((r) => r.relatedId);
}

// Walks PREQUEL edges backward through the corpus as far as it's known,
// returning the id of the earliest entry in the chain — the spec's own
// "resolve chains from the relation graph and surface the entry point
// instead," for shelves recommending something NEW (never Finish What You
// Started, which walks FORWARD from something already owned instead, see
// findNextUnseenContinuation below — a fundamentally different direction,
// not a variant of this one). Stops at whichever entry has no known
// PREQUEL relation, or whose PREQUEL isn't itself in the corpus — resolving
// further than the corpus knows isn't possible, and guessing would be
// worse than stopping. `visited` guards a corpus data error (a relation
// cycle) from looping forever.
function resolveFranchiseEntryPoint(candidateId, corpusById) {
  let currentId = candidateId;
  const visited = new Set([currentId]);
  for (;;) {
    const current = corpusById[String(currentId)];
    if (!current) return currentId;
    const prequel = franchiseRelations(current).find((r) => r.relationType === 'PREQUEL');
    if (!prequel || !corpusById[String(prequel.relatedId)] || visited.has(prequel.relatedId)) return currentId;
    currentId = prequel.relatedId;
    visited.add(currentId);
  }
}

// Finish What You Started's own direction: from a COMPLETED library entry,
// walks SEQUEL/SIDE_STORY edges forward to find the NEAREST not-yet-owned
// continuation — never skipping ahead to a later entry while a nearer one
// is still unseen, the mirror-image principle of resolveFranchiseEntryPoint
// above. Returns the corpus entry for that continuation, or null if the
// corpus has nothing further, or every further entry is already owned.
function findNextUnseenContinuation(completedEntry, corpusById, ownedIds) {
  let currentId = completedEntry.anilistId;
  const visited = new Set([currentId]);
  for (;;) {
    const current = corpusById[String(currentId)];
    if (!current) return null;
    const next = franchiseRelations(current).find((r) => r.relationType === 'SEQUEL' || r.relationType === 'SIDE_STORY');
    if (!next || visited.has(next.relatedId)) return null;
    if (!ownedIds.has(next.relatedId)) return corpusById[String(next.relatedId)] || null;
    currentId = next.relatedId;
    visited.add(currentId);
  }
}

// Connected components over `.relations`, restricted to
// FRANCHISE_RELATION_TYPES and to ids already present in the candidate
// list — same symmetric-adjacency shape as state.js's own buildGroups
// (AniList relation edges aren't always mirrored both directions),
// adapted to a flat candidate list instead of a library-list's grouped
// entries. Returns one row per group: the entry point plus how many
// siblings it stands in for. The spec's own "one card per franchise,
// entry point shown, the rest behind it."
//
// The entry point is decided by the PREQUEL/SEQUEL subgraph alone, never
// by SIDE_STORY/PARENT and never by seasonYear as the PRIMARY signal —
// confirmed against this app's own real, seeded corpus, where a title's
// full "relatives" cluster routinely includes compilation movies, recap
// OVAs and alternate-cut releases connected only via SIDE_STORY/PARENT,
// with no PREQUEL/SEQUEL edge of their own (AniList's "Shingeki no
// Kyojin: Chronicle" recap movie is exactly this). Those satellites are
// real hiddenCount members (still counted, still collapsed away) but are
// never eligible to be the entry point, since they aren't part of any
// actual viewing-order chain — including them as root candidates was
// this function's first bug fix attempt's own mistake, which still
// degraded to seasonYear far too often on real data. Within the
// PREQUEL/SEQUEL-only subgraph, a "chain root" is a member with no
// PREQUEL edge that still has at least one PREQUEL/SEQUEL edge to
// something (excludes both mid/end-of-chain members AND those isolated
// satellites). Exactly one chain root: use it directly. More than one
// (the cluster contains two genuinely separate PREQUEL/SEQUEL chains,
// only linked via a looser SIDE_STORY/PARENT tie — AniList's "Shingeki
// no Kyojin Kouhen/Zenpen" recap-movie duology sits in exactly this
// relationship to the main TV chain): the LONGER chain wins, since it's
// far more likely to be the main series than a side compilation, tie-
// broken by seasonYear then anilistId. Zero chain roots (a relation
// cycle, or every member is an isolated satellite): falls back to
// earliest seasonYear across every member, the last resort when the
// graph gives no usable signal at all. seasonYear as a PRIMARY signal is
// provably wrong on real data: a prequel OVA/movie/gaiden can air AFTER
// the work it's narratively a prequel to (AniList's "Attack on Titan: No
// Regrets" OVA, seasonYear 2015, is a genuine PREQUEL to "Attack on
// Titan" TV, seasonYear 2013) — picking by seasonYear alone previously
// chose the SEQUEL as the displayed entry point in exactly that case,
// disagreeing with resolveFranchiseEntryPoint's own graph walk (which
// resolveAndFilter's owned/dismissed hiding check runs against) and
// silently defeating hideOwned once the wrongly-chosen "entry point"
// happened to already be owned.
function collapseFranchises(candidates) {
  const byId = new Map(candidates.map((c) => [c.anilistId, c]));
  const adjacency = new Map(candidates.map((c) => [c.anilistId, new Set()])); // full graph: every FRANCHISE_RELATION_TYPES edge, for clustering/hiddenCount
  const hasPrequel = new Set(); // has a PREQUEL edge of its own -> not a chain root
  const hasChainEdge = new Set(); // participates in >=1 PREQUEL/SEQUEL edge, from either side -> eligible to be a chain root at all
  const chainNext = new Map(); // anilistId -> Set of ids that come AFTER it in viewing order, PREQUEL/SEQUEL only
  const addNext = (fromId, toId) => {
    if (!chainNext.has(fromId)) chainNext.set(fromId, new Set());
    chainNext.get(fromId).add(toId);
  };
  for (const c of candidates) {
    for (const rel of franchiseRelations(c)) {
      if (!byId.has(rel.relatedId)) continue;
      adjacency.get(c.anilistId).add(rel.relatedId);
      adjacency.get(rel.relatedId).add(c.anilistId);
      if (rel.relationType === 'SEQUEL') {
        hasChainEdge.add(c.anilistId);
        hasChainEdge.add(rel.relatedId);
        addNext(c.anilistId, rel.relatedId); // c comes before rel.relatedId
      } else if (rel.relationType === 'PREQUEL') {
        hasPrequel.add(c.anilistId);
        hasChainEdge.add(c.anilistId);
        hasChainEdge.add(rel.relatedId);
        addNext(rel.relatedId, c.anilistId); // rel.relatedId (the prequel) comes before c
      }
    }
  }
  // Counts members reachable by walking chainNext forward from startId,
  // guarding a cycle the same way resolveFranchiseEntryPoint's own walk
  // does — a length, not a truth claim, purely to compare two candidate
  // chains against each other.
  function chainLength(startId) {
    const seen = new Set([startId]);
    let count = 1;
    let current = startId;
    for (;;) {
      const next = [...(chainNext.get(current) || [])].find((id) => !seen.has(id));
      if (next === undefined) return count;
      seen.add(next);
      count += 1;
      current = next;
    }
  }
  const visited = new Set();
  const groups = [];
  for (const c of candidates) {
    if (visited.has(c.anilistId)) continue;
    const stack = [c.anilistId];
    visited.add(c.anilistId);
    const members = [];
    while (stack.length) {
      const id = stack.pop();
      members.push(byId.get(id));
      for (const neighborId of adjacency.get(id)) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          stack.push(neighborId);
        }
      }
    }
    const chainRoots = members.filter((m) => !hasPrequel.has(m.anilistId) && hasChainEdge.has(m.anilistId));
    let entryPoint;
    if (chainRoots.length === 1) {
      entryPoint = chainRoots[0];
    } else if (chainRoots.length > 1) {
      entryPoint = chainRoots.slice().sort((a, b) => chainLength(b.anilistId) - chainLength(a.anilistId) || (a.seasonYear || 9999) - (b.seasonYear || 9999) || a.anilistId - b.anilistId)[0];
    } else {
      entryPoint = members.slice().sort((a, b) => (a.seasonYear || 9999) - (b.seasonYear || 9999) || a.anilistId - b.anilistId)[0];
    }
    groups.push({ entryPoint, hiddenCount: members.length - 1 });
  }
  return groups;
}

// A small deterministic PRNG seeded from a plain string (the app's own
// `localDay`, config/tuning.js's `randomnessSeedSource: 'localDay'`
// convention) — same day, same shelf order; a different day reshuffles.
// Not cryptographic, doesn't need to be: this only ever picks which
// already-qualified candidates get a second look, never anything
// security- or fairness-sensitive.
function seedFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return hash || 1;
}

function seededRng(seed) {
  let state = seed;
  return function () {
    state = (state * 1103515245 + 12345) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function shuffleWithRng(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Greedily fills a shelf up to `pageSize`, never letting one primary genre
// exceed `capRatio` of the page while enough diverse candidates exist to
// avoid it. Candidates arrive already ranked (by score) and are walked in
// that order; once a genre hits its cap, later candidates of that genre
// are deferred to a day-seeded-shuffled backfill pass rather than dropped
// outright — still real candidates, just not favoured on THIS page. If
// there simply aren't enough OTHER candidates to reach `pageSize` without
// them, the cap is relaxed during backfill rather than shipping a
// sparser-than-necessary shelf: the cap is a diversity guideline against
// homogeneity, not a hard ceiling worth sacrificing shelf completeness
// for when nothing else is available.
function applyDiversityCap({ candidates, primaryGenrePriority, capRatio, pageSize, localDay }) {
  const cap = Math.max(1, Math.floor(pageSize * capRatio));
  const genreCounts = {};
  const selected = [];
  const overflow = [];
  for (const candidate of candidates) {
    if (selected.length >= pageSize) {
      overflow.push(candidate);
      continue;
    }
    const primary = resolvePrimaryGenre(candidate.genres, primaryGenrePriority);
    const count = primary === null ? 0 : genreCounts[primary] || 0;
    if (primary !== null && count >= cap) {
      overflow.push(candidate);
      continue;
    }
    if (primary !== null) genreCounts[primary] = count + 1;
    selected.push(candidate);
  }
  if (selected.length < pageSize && overflow.length) {
    const shuffled = shuffleWithRng(overflow, seededRng(seedFromString(localDay || '')));
    for (const candidate of shuffled) {
      if (selected.length >= pageSize) break;
      selected.push(candidate);
    }
  }
  return selected;
}

// Shelf 3: hidden gems. config/tuning.js's own RECOMMENDATIONS.hiddenGem
// (normalised score >= 7.5, popularity < 50,000 — AniList's `popularity`
// is this app's only analogue to "members", confirmed at P0.2/documented
// in docs/v2-backlog.md; there is no field literally named "members").
function isHiddenGem(candidate, { minNormalizedScore, maxPopularity }) {
  return (candidate.normalizedScore ?? 0) >= minNormalizedScore && (candidate.popularity ?? Infinity) < maxPopularity;
}

// Shelf 4: short and finishable. 13 episodes or fewer, or one film.
function isShortAndFinishable(candidate, maxEpisodes = 13) {
  if (candidate.format === 'MOVIE') return true;
  return typeof candidate.totalEpisodes === 'number' && candidate.totalEpisodes > 0 && candidate.totalEpisodes <= maxEpisodes;
}

// Shelf 1's own anchor set — "anchored on the highest-rated entries,
// rotating": the top `count * 2` rated library entries, seeded-shuffled by
// localDay and cut down to `count`, so the exact anchors vary day to day
// while always staying within the genuinely highest-rated pool (never a
// mediocre rating just because the shuffle favoured it).
function pickRotatingAnchors(ratedEntries, localDay, count = 5) {
  const sorted = [...ratedEntries].sort((a, b) => b.myScore - a.myScore);
  const pool = sorted.slice(0, Math.max(count * 2, count));
  if (pool.length <= count) return pool;
  return shuffleWithRng(pool, seededRng(seedFromString(localDay || ''))).slice(0, count);
}

// Up to 2 anchors sharing a genre with the candidate, highest-rated first —
// the spec's own example shape ("Because you rated Monster 10 and
// Steins;Gate 9").
function becauseYouLikedMatches(candidate, anchors) {
  const candidateGenres = new Set(candidate.genres || []);
  return anchors
    .filter((e) => (e.genres || []).some((g) => candidateGenres.has(g)))
    .sort((a, b) => b.myScore - a.myScore)
    .slice(0, 2);
}

function formatBecauseYouLiked(matches) {
  const title = (e) => e.titleEnglish || e.titleRomaji || 'a show you rated';
  if (matches.length === 0) return 'Matches what you tend to rate highly.';
  if (matches.length === 1) return `Because you rated ${title(matches[0])} ${matches[0].myScore}.`;
  return `Because you rated ${title(matches[0])} ${matches[0].myScore} and ${title(matches[1])} ${matches[1].myScore}.`;
}

function formatHiddenGem(candidate) {
  return `A hidden gem: rated ${candidate.normalizedScore}/10 by far fewer people than usual.`;
}

function formatShortAndFinishable(candidate) {
  if (candidate.format === 'MOVIE') return 'One film — an easy watch.';
  return `Only ${candidate.totalEpisodes} episodes — an easy watch.`;
}

function formatFinishWhatYouStarted(fromTitle) {
  return fromTitle ? `Continues ${fromTitle}, which you finished.` : 'Continues a series you finished.';
}

// P5B.1's own shelves (5-9 of the spec's "Shelves 5 to 10" — 10 has no
// social/list-comparison layer to depend on and is deferred to the
// backlog per the spec's own instruction).

// Shelf 7: community classics. The exact popularity-axis inverse of
// hiddenGem — same score floor as "excellent" (7.5), but a HIGH
// popularity floor instead of a low ceiling.
function isCommunityClassic(candidate, { minNormalizedScore, minPopularity }) {
  return (candidate.normalizedScore ?? 0) >= minNormalizedScore && (candidate.popularity ?? 0) >= minPopularity;
}

// Shelf 9: ironically essential. Low score, high notoriety — deliberately
// the one shelf where a LOW score is the qualifying signal, not a filter
// against it.
function isIronicallyEssential(candidate, { maxNormalizedScore, minPopularity }) {
  return (candidate.normalizedScore ?? Infinity) <= maxNormalizedScore && (candidate.popularity ?? 0) >= minPopularity;
}

// Shelf 8: this season. AniList's season boundary is calendar-quarterly
// (WINTER Jan-Mar, SPRING Apr-Jun, SUMMER Jul-Sep, FALL Oct-Dec) — the
// same quarterly grouping scorer.js's own SEASON_MONTH already encodes in
// the other direction (season -> representative month); this is the
// month -> season direction, needed here to know what "this season"
// currently means.
const MONTH_TO_SEASON = ['WINTER', 'WINTER', 'WINTER', 'SPRING', 'SPRING', 'SPRING', 'SUMMER', 'SUMMER', 'SUMMER', 'FALL', 'FALL', 'FALL'];
function currentSeason(nowMs) {
  const d = new Date(nowMs);
  return { season: MONTH_TO_SEASON[d.getMonth()], seasonYear: d.getFullYear() };
}
function isAiringThisSeason(candidate, current) {
  return candidate.season === current.season && candidate.seasonYear === current.seasonYear;
}

// Shelf 5: blind spot. "Never touched" reads broadly — any library entry
// of any status/rating counts as having touched a genre, not just a
// rated one; a genre the user dropped or merely added to Plan to Watch is
// not a blind spot.
function touchedGenres(libraryEntries) {
  const set = new Set();
  for (const e of libraryEntries) {
    for (const g of e.genres || []) set.add(g);
  }
  return set;
}

// "Strong critical standing" is a GENRE-level judgment (the corpus's own
// average score for candidates carrying that genre), not a single
// candidate's own score — one lucky 9/10 outlier in a genre with only one
// corpus entry can't call the whole genre well-regarded, hence the
// minimum-sample-size floor.
function genreAverageScores(candidates, minCandidates) {
  const sums = {};
  const counts = {};
  for (const c of candidates) {
    if (typeof c.normalizedScore !== 'number') continue;
    for (const g of c.genres || []) {
      sums[g] = (sums[g] || 0) + c.normalizedScore;
      counts[g] = (counts[g] || 0) + 1;
    }
  }
  const averages = {};
  for (const g of Object.keys(sums)) {
    if (counts[g] >= minCandidates) averages[g] = sums[g] / counts[g];
  }
  return averages;
}

// Shelves 6: from the studio you love / from the director you love.
// AniList's own `staff.edges[].role` strings are free text and frequently
// qualify a dub/episode/sound credit ("ADR Director (English)", "Episode
// Director (ep 8)") that isn't the show's actual director — `directorRoles`
// (config/tuning.js) is a deliberately narrow allowlist of the roles that
// mean "the person who directed this anime" in the ordinary sense.
function directorNamesOf(candidate, directorRoles) {
  return (candidate.staff || []).filter((s) => directorRoles.includes(s.role) && s.name).map((s) => s.name);
}

// Picks the single favorite studio and the single favorite director from
// the user's OWN rated library, scoped to entries scored at least
// `minScore` (config/tuning.js's `favoriteMinScore` — without this floor a
// user's only rated-and-corpus-known entry could crown its studio/director
// "favorite" even at a score of 2, which isn't what "the studio/director
// you love" means) and whose corpus record is known (an older rating for a
// title the corpus hasn't reached yet has no studio/staff data to offer,
// and degrades to simply not counting toward this pick — the same
// graceful "unknown corpus data" degradation every other shelf already
// tolerates). Tracking the single highest-scoring qualifying entry that
// carries a studio/director is equivalent to tracking each studio's/
// director's own best score and picking the best of those: no other
// studio's best entry can outscore the GLOBAL best entry, by definition.
function findFavoriteStudioAndDirector(libraryEntries, corpusById, { directorRoles, minScore }) {
  let bestStudio = null;
  let bestDirector = null;
  for (const entry of libraryEntries) {
    if (typeof entry.myScore !== 'number' || entry.myScore < minScore) continue;
    const corpus = corpusById[String(entry.anilistId)];
    if (!corpus) continue;
    const anchorTitle = entry.titleEnglish || entry.titleRomaji || null;
    if (corpus.studio && (!bestStudio || entry.myScore > bestStudio.score)) {
      bestStudio = { name: corpus.studio, score: entry.myScore, anchorTitle };
    }
    for (const name of directorNamesOf(corpus, directorRoles)) {
      if (!bestDirector || entry.myScore > bestDirector.score) {
        bestDirector = { name, score: entry.myScore, anchorTitle };
      }
    }
  }
  return { bestStudio, bestDirector };
}

function formatCommunityClassic(candidate) {
  return `A community classic: rated ${candidate.normalizedScore}/10 by a huge audience.`;
}

function formatIronicallyEssential() {
  return "Ironically essential: not critically loved, but everyone's seen it.";
}

function formatThisSeason() {
  return 'New this season.';
}

function formatFromStudio(favoriteStudio) {
  return `From ${favoriteStudio.name}, the studio behind ${favoriteStudio.anchorTitle}.`;
}

function formatFromDirector(favoriteDirector) {
  return `From ${favoriteDirector.name}, the director of ${favoriteDirector.anchorTitle}.`;
}

// Cites whichever of the candidate's own qualifying blind-spot genres has
// the highest genre-wide average score — the most compelling of possibly
// several genres a single candidate happens to carry.
function formatBlindSpot(candidate, blindSpotGenres, genreAverages) {
  const matching = (candidate.genres || []).filter((g) => blindSpotGenres.has(g));
  const best = matching.sort((a, b) => genreAverages[b] - genreAverages[a])[0];
  const avg = genreAverages[best];
  return `You've never watched ${best} — but it's critically well-regarded (avg ${avg.toFixed(1)}/10). A stretch, but worth trying.`;
}

// P5B.2's own reason text: cites the specific genre or theme tag that
// actually matched, rather than repeating the mood's own name on every
// single card (already the shelf's own heading, so that would be pure
// noise) — real information about WHY this particular title fits,
// matching every other shelf's own "short concrete reason" bar. Falls
// back to a plain acknowledgement for the two moods with no genre/theme
// rule at all ("Peak fiction", "One sitting" — both defined purely by a
// score or runtime threshold).
function formatMoodMatch(candidate, moodDef) {
  const candidateGenres = new Set(candidate.genres || []);
  const matchedGenre = (moodDef.genres || []).find((g) => candidateGenres.has(g));
  if (matchedGenre) return `Genre: ${matchedGenre}.`;
  const candidateThemeNames = new Set((candidate.tags || []).filter(isThemeTag).map((t) => t.name));
  const matchedTheme = (moodDef.themeTags || []).find((t) => candidateThemeNames.has(t));
  if (matchedTheme) return `Tagged ${matchedTheme}.`;
  return 'A match for this mood.';
}

// The shared back half of every shelf's own pipeline: collapse franchises,
// score + rank, apply the diversity cap, and attach each card's own "why"
// text plus how many franchise siblings it's standing in for. Everything
// before this point (candidate generation, owned/dismissed filtering,
// entry-point resolution) is shelf-specific and happens in buildShelves
// below; this part is identical for all four shelves per the spec's own
// "rules for all shelves."
function rankAndCapShelf(candidates, { tasteProfile, context, pageSize, tuning, localDay, reasonFn, rawCandidateCount, emptyReason }) {
  const groups = collapseFranchises(candidates);
  const entryPoints = groups.map((g) => g.entryPoint);
  const scored = entryPoints
    .map((c) => ({ candidate: c, total: score(c, tasteProfile, context).total }))
    .sort((a, b) => b.total - a.total)
    .map((s) => s.candidate);
  const capped = applyDiversityCap({ candidates: scored, primaryGenrePriority: tuning.primaryGenrePriority, capRatio: tuning.genreDiversityCapRatio, pageSize, localDay });
  const hiddenCountById = new Map(groups.map((g) => [g.entryPoint.anilistId, g.hiddenCount]));
  const cards = capped.map((c) => ({
    anilistId: c.anilistId,
    candidate: c,
    because: reasonFn(c),
    hiddenCount: hiddenCountById.get(c.anilistId) || 0,
  }));
  return {
    cards,
    empty: cards.length === 0,
    // "A shelf with nothing says why" (spec) — distinguishes "nothing
    // qualified at all" from "everything that qualified is already yours
    // or dismissed", since those call for different copy.
    emptyReason: cards.length === 0 ? (rawCandidateCount === 0 ? emptyReason.noneFound : emptyReason.allFilteredOut) : null,
    totalCandidates: scored.length,
  };
}

// The main entry point. `corpusEntries`: the corpus cache's own `entries`
// object, keyed by `String(anilistId)`. `libraryEntries`: Store.getEntries().
// `dismissedIds`: a Set (or array) of anilistIds. `tasteProfile`: whatever
// GET /api/taste-profile returned. `tuning`: config/tuning.js's
// RECOMMENDATIONS. `localDay`: the app's own local-day string (P1.5's
// eventLog.js computeLocalDay), reused here purely for its rotation seed,
// never for any time-semantics purpose. `adventurousness`: 1-10, defaults
// to the tuning range's own midpoint since no slider exists yet (P5B.2/
// P5B.3's own future UI — same documented placeholder P5A.3's debug panel
// already established). `hideOwned`: the spec's own per-shelf default-on
// toggle. `rng`: injectable, passed through to the scorer's own
// serendipity term for deterministic tests.
function buildShelves({
  corpusEntries,
  libraryEntries,
  dismissedIds,
  tasteProfile,
  tuning,
  nowMs,
  localDay,
  adventurousness,
  hideOwned = true,
  pageSize = 12,
  rng = Math.random,
  activeMoodId = null,
  // Defaults mirror config/tuning.js's own TIME_SEMANTICS.
  // episodeDurationFallbackMinutes exactly — not imported directly (this
  // module takes every tunable value as a plain argument, never reaches
  // into config/tuning.js itself, the same dependency-injection
  // convention `tuning`/`localDay`/`rng` already establish), so a caller
  // that doesn't care about "One sitting" can omit this entirely.
  timeSemantics = { episodeDurationFallbackMinutes: { tv: 24, film: 100 } },
}) {
  const corpusById = corpusEntries || {};
  const ownedIds = new Set(libraryEntries.map((e) => e.anilistId));
  const dismissedSet = dismissedIds instanceof Set ? dismissedIds : new Set(dismissedIds || []);
  const effectiveAdventurousness = adventurousness ?? (tuning.adventurousness.min + tuning.adventurousness.max) / 2;
  const droppedTitles = libraryEntries
    .filter((e) => e.listStatus === 'dropped')
    .map((e) => ({ genres: e.genres, episode: e.episodesWatched, totalEpisodes: e.totalEpisodes }));
  const libraryRelatedIds = new Set(libraryEntries.flatMap((e) => e.relatedIds || []));
  const scoreContext = { nowMs, adventurousness: effectiveAdventurousness, tuning, droppedTitles, libraryRelatedIds, rng };
  const ratedEntries = libraryEntries.filter((e) => typeof e.myScore === 'number');
  const allCorpusCandidates = Object.values(corpusById);
  const hideSet = hideOwned ? ownedIds : new Set();

  // Groups a batch of raw candidates by resolved franchise entry point,
  // hides a whole franchise when its ENTRY POINT is owned/dismissed (never
  // just the individual raw candidate — the required "S2 still resolves to
  // the now-owned S1, still hidden" behavior: once you own the entry point,
  // the whole franchise defers to Finish What You Started instead of also
  // showing up here), then hands rankAndCapShelf's own collapseFranchises
  // call BOTH the entry point and its qualifying siblings, not just the
  // entry point alone. Passing only the entry point (this function's
  // earlier shape) left collapseFranchises with never more than one member
  // per franchise to look at, so its own hiddenCount — the "+N" badge —
  // was always 0 by construction; the raw candidate siblings have to
  // survive into that call for the count to mean anything.
  function resolveAndFilter(rawCandidates) {
    const byEntryId = new Map();
    for (const c of rawCandidates) {
      const entryId = resolveFranchiseEntryPoint(c.anilistId, corpusById);
      if (!byEntryId.has(entryId)) byEntryId.set(entryId, []);
      byEntryId.get(entryId).push(c);
    }
    const result = [];
    for (const [entryId, members] of byEntryId) {
      if (hideSet.has(entryId) || dismissedSet.has(entryId)) continue;
      const entryPoint = corpusById[String(entryId)] || members[0];
      result.push(entryPoint);
      for (const member of members) {
        if (member.anilistId !== entryId) result.push(member);
      }
    }
    return result;
  }

  // Shelf 1: Because you liked X — pre-filtered to candidates sharing a
  // genre with this rotation's anchors, so the shelf's own "why" always has
  // a real anchor to cite (never falls back to the generic message).
  const anchors = pickRotatingAnchors(ratedEntries, localDay);
  const likedRaw = allCorpusCandidates.filter((c) => becauseYouLikedMatches(c, anchors).length > 0);
  const likedFiltered = resolveAndFilter(likedRaw);
  const becauseYouLiked = {
    id: 'because-you-liked',
    title: 'Because you liked...',
    ...rankAndCapShelf(likedFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize,
      tuning,
      localDay,
      rawCandidateCount: likedRaw.length,
      reasonFn: (c) => formatBecauseYouLiked(becauseYouLikedMatches(c, anchors)),
      emptyReason: {
        noneFound: 'Rate a few more shows and this shelf will find its footing.',
        allFilteredOut: 'You already have everything that matched — nice work.',
      },
    }),
  };

  // Shelf 2: Finish what you started — walks forward from every COMPLETED
  // entry to the nearest not-yet-owned continuation. Deliberately skips
  // the prerequisite-unseen rule (the spec's own named exception) and the
  // owned-filter (every candidate here is unseen by construction).
  const continuesFromById = new Map();
  const finishRaw = [];
  const seenFinish = new Set();
  for (const entry of libraryEntries) {
    if (entry.listStatus !== 'watched') continue;
    const next = findNextUnseenContinuation(entry, corpusById, ownedIds);
    if (!next || seenFinish.has(next.anilistId)) continue;
    seenFinish.add(next.anilistId);
    finishRaw.push(next);
    continuesFromById.set(next.anilistId, entry.titleEnglish || entry.titleRomaji || null);
  }
  const finishFiltered = finishRaw.filter((c) => !dismissedSet.has(c.anilistId));
  const finishWhatYouStarted = {
    id: 'finish-what-you-started',
    title: 'Finish what you started',
    ...rankAndCapShelf(finishFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize,
      tuning,
      localDay,
      rawCandidateCount: finishRaw.length,
      reasonFn: (c) => formatFinishWhatYouStarted(continuesFromById.get(c.anilistId)),
      emptyReason: {
        noneFound: 'Nothing left to continue right now — every completed series is all caught up.',
        allFilteredOut: 'The next episodes here were all dismissed — check "Not interested" to bring one back.',
      },
    }),
  };

  // Shelf 3: Hidden gems.
  const gemsRaw = allCorpusCandidates.filter((c) => isHiddenGem(c, tuning.hiddenGem));
  const gemsFiltered = resolveAndFilter(gemsRaw);
  const hiddenGems = {
    id: 'hidden-gems',
    title: 'Hidden gems',
    ...rankAndCapShelf(gemsFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize,
      tuning,
      localDay,
      rawCandidateCount: gemsRaw.length,
      reasonFn: formatHiddenGem,
      emptyReason: {
        noneFound: 'The corpus hasn’t reached enough hidden gems yet — check back as it grows.',
        allFilteredOut: 'You’ve already found this corpus’s hidden gems.',
      },
    }),
  };

  // Shelf 4: Short and finishable.
  const shortRaw = allCorpusCandidates.filter((c) => isShortAndFinishable(c));
  const shortFiltered = resolveAndFilter(shortRaw);
  const shortAndFinishable = {
    id: 'short-and-finishable',
    title: 'Short and finishable',
    ...rankAndCapShelf(shortFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize,
      tuning,
      localDay,
      rawCandidateCount: shortRaw.length,
      reasonFn: formatShortAndFinishable,
      emptyReason: {
        noneFound: 'The corpus hasn’t reached enough short series yet — check back as it grows.',
        allFilteredOut: 'You’ve already cleared this corpus’s short backlog.',
      },
    }),
  };

  // Shelf 5: Blind spot. Pools candidates from EVERY genre that qualifies
  // (never touched by the library, corpus-wide average score clears the
  // bar) and lets the normal score()-based ranking pick the single best
  // entry point across that whole pool — "best genre first, then its own
  // best entry point" would be an unnecessary extra step when the
  // ranking already finds the single best candidate directly.
  const touched = touchedGenres(libraryEntries);
  const genreAverages = genreAverageScores(allCorpusCandidates, tuning.blindSpot.minCandidatesForGenre);
  const blindSpotGenres = new Set(Object.keys(genreAverages).filter((g) => !touched.has(g) && genreAverages[g] >= tuning.blindSpot.minGenreAverageScore));
  const blindSpotRaw = allCorpusCandidates.filter((c) => (c.genres || []).some((g) => blindSpotGenres.has(g)));
  const blindSpotFiltered = resolveAndFilter(blindSpotRaw);
  const blindSpot = {
    id: 'blind-spot',
    title: 'Blind spot',
    ...rankAndCapShelf(blindSpotFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize: 1,
      tuning,
      localDay,
      rawCandidateCount: blindSpotRaw.length,
      reasonFn: (c) => formatBlindSpot(c, blindSpotGenres, genreAverages),
      emptyReason: {
        noneFound: 'Nothing stands out as a blind spot yet — check back as the corpus grows.',
        allFilteredOut: "You've already tried this corpus's best blind-spot pick.",
      },
    }),
  };

  // Shelves 6: From the studio you love / From the director you love —
  // two shelves, not one, since a user can have clear data for one and
  // none for the other, and each deserves its own honest empty state.
  const { bestStudio, bestDirector } = findFavoriteStudioAndDirector(libraryEntries, corpusById, {
    directorRoles: tuning.directorRoles,
    minScore: tuning.favoriteMinScore,
  });

  const studioRaw = bestStudio ? allCorpusCandidates.filter((c) => c.studio === bestStudio.name) : [];
  const studioFiltered = resolveAndFilter(studioRaw);
  const fromStudio = {
    id: 'from-studio',
    title: 'From the studio behind...',
    ...rankAndCapShelf(studioFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize,
      tuning,
      localDay,
      rawCandidateCount: studioRaw.length,
      reasonFn: () => formatFromStudio(bestStudio),
      emptyReason: {
        noneFound: 'Rate a few more shows with known studio data so a favorite can emerge.',
        allFilteredOut: "You've already seen everything from your favorite studio in this corpus.",
      },
    }),
  };

  const directorRaw = bestDirector ? allCorpusCandidates.filter((c) => directorNamesOf(c, tuning.directorRoles).includes(bestDirector.name)) : [];
  const directorFiltered = resolveAndFilter(directorRaw);
  const fromDirector = {
    id: 'from-director',
    title: 'From the director of...',
    ...rankAndCapShelf(directorFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize,
      tuning,
      localDay,
      rawCandidateCount: directorRaw.length,
      reasonFn: () => formatFromDirector(bestDirector),
      emptyReason: {
        noneFound: 'Rate a few more shows with known staff data so a favorite director can emerge.',
        allFilteredOut: "You've already seen everything from your favorite director in this corpus.",
      },
    }),
  };

  // Shelf 7: Community classics.
  const classicsRaw = allCorpusCandidates.filter((c) => isCommunityClassic(c, { minNormalizedScore: tuning.communityClassic.minNormalizedScore, minPopularity: tuning.highNotoriety.minPopularity }));
  const classicsFiltered = resolveAndFilter(classicsRaw);
  const communityClassics = {
    id: 'community-classics',
    title: "Community classics you've missed",
    ...rankAndCapShelf(classicsFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize,
      tuning,
      localDay,
      rawCandidateCount: classicsRaw.length,
      reasonFn: formatCommunityClassic,
      emptyReason: {
        noneFound: 'The corpus hasn’t reached enough community classics yet — check back as it grows.',
        allFilteredOut: 'You’ve already seen this corpus’s community classics.',
      },
    }),
  };

  // Shelf 8: This season, for you.
  const current = currentSeason(nowMs);
  const seasonRaw = allCorpusCandidates.filter((c) => isAiringThisSeason(c, current));
  const seasonFiltered = resolveAndFilter(seasonRaw);
  const thisSeason = {
    id: 'this-season',
    title: 'This season, for you',
    ...rankAndCapShelf(seasonFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize,
      tuning,
      localDay,
      rawCandidateCount: seasonRaw.length,
      reasonFn: formatThisSeason,
      emptyReason: {
        noneFound: 'Nothing from this season is in the corpus yet — check back as it grows.',
        allFilteredOut: "You're already caught up on this season.",
      },
    }),
  };

  // Shelf 9: Ironically essential.
  const ironicRaw = allCorpusCandidates.filter((c) => isIronicallyEssential(c, { maxNormalizedScore: tuning.ironicallyEssential.maxNormalizedScore, minPopularity: tuning.highNotoriety.minPopularity }));
  const ironicFiltered = resolveAndFilter(ironicRaw);
  const ironicallyEssential = {
    id: 'ironically-essential',
    title: 'Ironically essential',
    ...rankAndCapShelf(ironicFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize,
      tuning,
      localDay,
      rawCandidateCount: ironicRaw.length,
      reasonFn: formatIronicallyEssential,
      emptyReason: {
        noneFound: 'The corpus hasn’t reached enough of these yet — check back as it grows.',
        allFilteredOut: 'You’ve already seen this corpus’s ironically essential picks.',
      },
    }),
  };

  // P5B.2's own mood filter: "one-tap intents that RESHAPE THE PAGE" —
  // structurally a single, larger shelf (moodPageSize, not pageSize),
  // computed independently of the 10 named shelves above (which keep
  // being computed regardless, at negligible cost per the measured pure-
  // compute budget — see docs/v2-progress.md's P5A.4/P5B.1 entries) so
  // that switching moods on and off never needs a second code path.
  // discover.js/render.js decide whether to DISPLAY this or the 10
  // shelves; buildShelves() itself always returns both when a mood is
  // active, never chooses for the caller.
  let moodShelf = null;
  if (activeMoodId) {
    const moodDef = MOOD_REGISTRY.find((m) => m.id === activeMoodId);
    if (moodDef) {
      const moodRaw = allCorpusCandidates.filter((c) => matchesMood(c, moodDef, timeSemantics));
      const moodFiltered = resolveAndFilter(moodRaw);
      moodShelf = {
        id: moodDef.id,
        copyKey: moodDef.copyKey,
        ...rankAndCapShelf(moodFiltered, {
          tasteProfile,
          context: scoreContext,
          pageSize: tuning.moodPageSize ?? pageSize * 2,
          tuning,
          localDay,
          rawCandidateCount: moodRaw.length,
          reasonFn: (c) => formatMoodMatch(c, moodDef),
          emptyReason: {
            noneFound: 'Nothing matches this mood yet — check back as the corpus grows.',
            allFilteredOut: "You've already seen everything that matches this mood.",
          },
        }),
      };
    }
  }

  return {
    shelves: [
      becauseYouLiked,
      finishWhatYouStarted,
      hiddenGems,
      shortAndFinishable,
      blindSpot,
      fromStudio,
      fromDirector,
      communityClassics,
      thisSeason,
      ironicallyEssential,
    ],
    moodShelf,
  };
}

export {
  franchiseRelatedIds,
  resolveFranchiseEntryPoint,
  findNextUnseenContinuation,
  collapseFranchises,
  applyDiversityCap,
  isHiddenGem,
  isShortAndFinishable,
  pickRotatingAnchors,
  becauseYouLikedMatches,
  formatBecauseYouLiked,
  formatHiddenGem,
  formatShortAndFinishable,
  formatFinishWhatYouStarted,
  isCommunityClassic,
  isIronicallyEssential,
  currentSeason,
  isAiringThisSeason,
  touchedGenres,
  genreAverageScores,
  directorNamesOf,
  findFavoriteStudioAndDirector,
  formatCommunityClassic,
  formatIronicallyEssential,
  formatThisSeason,
  formatFromStudio,
  formatFromDirector,
  formatBlindSpot,
  formatMoodMatch,
  buildShelves,
};
