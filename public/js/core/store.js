// Store core (v3 Phase 2): a revision counter every mutation bumps, selector
// subscriptions notified once per batch of mutations, a memo helper keyed on
// the revision, and field-level undo commands.
//
// state.js keeps the library's domain operations and calls touch() from each
// mutator; views subscribe to what they render instead of being re-rendered
// wholesale by whoever changed something.

export function createRevisionStore() {
  let revision = 0;
  let scheduled = false;
  const subscribers = new Set();

  function flush() {
    scheduled = false;
    for (const sub of [...subscribers]) {
      if (!subscribers.has(sub)) continue;
      let next;
      try {
        next = sub.selector();
      } catch (err) {
        console.error('[store] selector failed', err);
        continue;
      }
      if (!shallowEqual(next, sub.last)) {
        const prev = sub.last;
        sub.last = next;
        try {
          sub.callback(next, prev);
        } catch (err) {
          console.error('[store] subscriber failed', err);
        }
      }
    }
  }

  return {
    get revision() {
      return revision;
    },
    // Marks the state as changed. Subscribers run once, in a microtask, however
    // many mutations happened in the same task.
    touch() {
      revision += 1;
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(flush);
      }
      return revision;
    },
    // selector() -> value; callback(next, prev) runs when the value changes
    // (shallow comparison: same primitive, or arrays/objects with the same
    // top-level members). Returns an unsubscribe function.
    subscribe(selector, callback) {
      const sub = { selector, callback, last: selector() };
      subscribers.add(sub);
      return () => subscribers.delete(sub);
    },
  };
}

export function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}

// Caches fn's result per key string, keeping only the latest `size` keys. The
// caller builds the key from everything the result depends on (the store
// revision, the relevant preferences).
export function memoize(fn, { size = 8 } = {}) {
  const cache = new Map();
  return function memoized(key, ...args) {
    if (cache.has(key)) return cache.get(key);
    const value = fn(...args);
    cache.set(key, value);
    if (cache.size > size) cache.delete(cache.keys().next().value);
    return value;
  };
}

// A field-level undo command for one record. apply() writes `patch` and
// remembers exactly the fields it changed; undo() reverts only those fields,
// and only where the record still holds what the patch set, so a later edit to
// the same field (or any other field) is never thrown away.
//   read(id)          -> the current record
//   write(id, patch)  -> applies a patch
export function patchCommand({ read, write }, id, patch) {
  let before = null;
  return {
    apply() {
      const current = read(id);
      if (!current) return false;
      before = {};
      for (const k of Object.keys(patch)) before[k] = current[k];
      write(id, patch);
      return true;
    },
    undo() {
      const current = read(id);
      if (!current || !before) return {};
      const revert = {};
      for (const k of Object.keys(patch)) {
        if (JSON.stringify(current[k]) === JSON.stringify(patch[k])) revert[k] = before[k];
      }
      if (Object.keys(revert).length) write(id, revert);
      return revert;
    },
  };
}
