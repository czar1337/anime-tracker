'use strict';
// The Bayesian-adjusted score (spec 4.3): (v·R + m·C) / (v + m), with v the
// title's member count, R its average score (1–10), C the corpus mean and m
// the prior weight from tuning. A title few people have seen is pulled
// toward the mean, so a 9.1 from 300 members never outranks an 8.8 from
// 300,000, and the quality floor means something.

export function corpusMeanScore(entries) {
  let sum = 0;
  let n = 0;
  for (const e of entries) {
    if (typeof e.normalizedScore !== 'number') continue;
    sum += e.normalizedScore;
    n += 1;
  }
  return n ? sum / n : 6.5;
}

export function bayes(entry, { mean, m }) {
  const r = entry?.normalizedScore;
  if (typeof r !== 'number') return null;
  const v = Math.max(0, entry.popularity || 0);
  return (v * r + m * mean) / (v + m);
}
