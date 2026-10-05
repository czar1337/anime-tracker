'use strict';
// The Discover filter panel's predicate (the v2 advanced filters, unchanged
// in meaning). The engine applies it to each franchise member while choosing
// the entry point, so "Year: 2015+" can never show Kingdom (2012) just
// because a later season qualified.

import { totalRuntimeMinutes } from '../../moodLogic.js';
import { startYearOf, studiosOf } from './features.js';

export function matchesFilters(candidate, filters, timeSemantics) {
  if (!filters) return true;
  const year = startYearOf(candidate);
  if (typeof filters.yearMin === 'number' && (typeof year !== 'number' || year < filters.yearMin)) return false;
  if (typeof filters.yearMax === 'number' && (typeof year !== 'number' || year > filters.yearMax)) return false;
  const episodes = candidate.totalEpisodes;
  if (typeof filters.episodeMin === 'number' && (typeof episodes !== 'number' || episodes < filters.episodeMin)) return false;
  if (typeof filters.episodeMax === 'number' && (typeof episodes !== 'number' || episodes > filters.episodeMax)) return false;
  const score = candidate.normalizedScore;
  if (typeof filters.scoreMin === 'number' && (typeof score !== 'number' || score < filters.scoreMin)) return false;
  if (typeof filters.scoreMax === 'number' && (typeof score !== 'number' || score > filters.scoreMax)) return false;
  const members = candidate.popularity ?? 0;
  if (typeof filters.memberMin === 'number' && members < filters.memberMin) return false;
  if (typeof filters.memberMax === 'number' && members > filters.memberMax) return false;
  if (filters.studio && !studiosOf(candidate).includes(filters.studio)) return false;
  if (filters.source && candidate.source !== filters.source) return false;
  if (filters.format && candidate.format !== filters.format) return false;
  if (filters.airingStatus && candidate.status !== filters.airingStatus) return false;
  // v3 run 2: every chosen genre, and the season it started in.
  if (Array.isArray(filters.genres) && filters.genres.length > 0 && !filters.genres.every((g) => (candidate.genres || []).includes(g))) return false;
  if (filters.season && candidate.season !== filters.season) return false;
  if (filters.staffQuery) {
    const q = filters.staffQuery.toLowerCase();
    if (!(candidate.staff || []).some((s) => (s.name || '').toLowerCase().includes(q))) return false;
  }
  const tagNames = new Set((candidate.tags || []).map((t) => t.name));
  if (Array.isArray(filters.includeTags) && filters.includeTags.length > 0 && !filters.includeTags.some((t) => tagNames.has(t))) return false;
  if (Array.isArray(filters.excludeTags) && filters.excludeTags.length > 0 && filters.excludeTags.some((t) => tagNames.has(t))) return false;
  if (typeof filters.maxLengthMinutes === 'number' && totalRuntimeMinutes(candidate, timeSemantics.episodeDurationFallbackMinutes) > filters.maxLengthMinutes) return false;
  return true;
}
