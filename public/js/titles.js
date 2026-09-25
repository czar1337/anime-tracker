// Which title a series is shown under (v3 Phase 1 item 18). One rule for display
// and for the A→Z sort: v2 showed library cards as English-first but sorted them
// by romaji, so the list looked shuffled, and the titleLanguage preference only
// applied to Discover.
//
// `item` has titleEnglish / titleRomaji / titleNative (library entries and
// corpus candidates both do). Returns [primary, secondary]: the preferred
// language, falling back to whichever exists, and the next different title.

const ORDER_BY_LANGUAGE = {
  english: ['titleEnglish', 'titleRomaji', 'titleNative'],
  romaji: ['titleRomaji', 'titleEnglish', 'titleNative'],
  native: ['titleNative', 'titleEnglish', 'titleRomaji'],
};

export function titlesInOrder(item, titleLanguage = 'english') {
  const order = ORDER_BY_LANGUAGE[titleLanguage] || ORDER_BY_LANGUAGE.english;
  const values = order.map((k) => (item && typeof item[k] === 'string' ? item[k].trim() : '')).filter(Boolean);
  const primary = values[0] || '';
  const secondary = values.find((v) => v !== primary) || null;
  return [primary, secondary];
}

export function displayTitle(item, titleLanguage = 'english') {
  return titlesInOrder(item, titleLanguage)[0];
}
