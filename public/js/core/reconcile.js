// Keyed list reconciliation with an in-place DOM morph (v3 Phase 2).
//
// v2 rebuilt the whole grid with innerHTML after every action. That replayed
// every entrance animation, regrew every progress bar from 0, threw away the +1
// pulse before it could be seen, and dropped keyboard focus. Instead:
//  - each item renders to an HTML string; an item whose string did not change is
//    not touched at all;
//  - a changed item is MORPHED in place (attributes and children patched), so the
//    node, its focus, its running transitions and its entrance state survive;
//  - a filter or sort change only moves existing nodes;
//  - only genuinely new items create nodes (and play their entrance).
//
// Morph rules worth knowing:
//  - a subtree whose root carries data-morph-key is left completely alone while
//    that key is unchanged (for runtime-owned state such as a cover image that
//    has faded in);
//  - the value of a focused input/textarea/select is never overwritten.

import { toElement } from './html.js';

const lastHtml = new WeakMap();

function syncAttributes(from, to) {
  for (const { name } of [...from.attributes]) {
    if (!to.hasAttribute(name)) from.removeAttribute(name);
  }
  for (const { name, value } of [...to.attributes]) {
    if (from.getAttribute(name) !== value) from.setAttribute(name, value);
  }
}

function syncFormState(from, to) {
  if (from === document.activeElement) return;
  if (from instanceof HTMLInputElement) {
    if (from.type === 'checkbox' || from.type === 'radio') {
      if (from.checked !== to.hasAttribute('checked')) from.checked = to.hasAttribute('checked');
    } else if (from.value !== (to.getAttribute('value') ?? '')) {
      from.value = to.getAttribute('value') ?? '';
    }
  } else if (from instanceof HTMLTextAreaElement) {
    if (from.value !== to.value) from.value = to.value;
  } else if (from instanceof HTMLSelectElement) {
    const wanted = [...to.options].find((o) => o.hasAttribute('selected'))?.value;
    if (wanted !== undefined && from.value !== wanted) from.value = wanted;
  }
}

export function morph(from, to) {
  if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName) {
    from.replaceWith(to);
    return to;
  }
  if (from.nodeType === Node.TEXT_NODE || from.nodeType === Node.COMMENT_NODE) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return from;
  }
  const key = to.getAttribute?.('data-morph-key');
  if (key !== null && key !== undefined && from.getAttribute('data-morph-key') === key) return from;
  syncAttributes(from, to);
  morphChildren(from, to);
  syncFormState(from, to);
  return from;
}

function morphChildren(fromParent, toParent) {
  const toChildren = [...toParent.childNodes];
  let fromChild = fromParent.firstChild;
  for (const toChild of toChildren) {
    if (!fromChild) {
      fromParent.appendChild(toChild);
      continue;
    }
    const next = fromChild.nextSibling;
    morph(fromChild, toChild);
    fromChild = next;
  }
  while (fromChild) {
    const next = fromChild.nextSibling;
    fromParent.removeChild(fromChild);
    fromChild = next;
  }
}

// Brings `container`'s element children in line with `items`.
//   key(item)          -> stable string id (becomes data-key)
//   render(item, i)    -> html`` result / string for ONE element
//   onCreate(el)       -> optional, called for brand-new elements only
//   keepUnmatched      -> leave keyed children that are not in `items` in place
//                         after the wanted ones (used between chunks)
// Children without a data-key are always removed.
export function reconcileList(container, items, { key, render, onCreate, keepUnmatched = false } = {}) {
  const existing = new Map();
  for (const child of [...container.children]) {
    const k = child.getAttribute('data-key');
    if (k !== null) existing.set(k, child);
    else child.remove();
  }
  const wanted = [];
  for (let i = 0; i < items.length; i++) {
    const k = String(key(items[i], i));
    const markup = String(render(items[i], i));
    let el = existing.get(k);
    if (el) {
      existing.delete(k);
      if (lastHtml.get(el) !== markup) {
        const next = toElement(markup);
        next.setAttribute('data-key', k);
        el = morph(el, next);
        lastHtml.set(el, markup);
      }
    } else {
      el = toElement(markup);
      el.setAttribute('data-key', k);
      lastHtml.set(el, markup);
      onCreate?.(el);
    }
    wanted.push(el);
  }
  if (!keepUnmatched) for (const stale of existing.values()) stale.remove();
  // Order: walk the wanted list and move only what is out of place.
  let cursor = container.firstElementChild;
  for (const el of wanted) {
    if (el === cursor) {
      cursor = cursor.nextElementSibling;
    } else {
      container.insertBefore(el, cursor);
    }
  }
  return wanted;
}

// Same as reconcileList, but only the first `firstCount` items synchronously and
// the rest in chunks on later frames, so a large list paints its first screen
// immediately. Nodes already on screen beyond the first screen stay put until
// their chunk reaches them (nothing flashes away). A newer call cancels chunks
// still pending from an older one.
const pendingChunks = new WeakMap();
export function reconcileListChunked(container, items, options = {}, { firstCount = 60, chunkSize = 250 } = {}) {
  const token = {};
  pendingChunks.set(container, token);
  if (items.length <= firstCount) {
    reconcileList(container, items, options);
    return Promise.resolve();
  }
  reconcileList(container, items.slice(0, firstCount), { ...options, keepUnmatched: true });
  return new Promise((resolve) => {
    let done = firstCount;
    const step = () => {
      if (pendingChunks.get(container) !== token) return resolve();
      done = Math.min(items.length, done + chunkSize);
      const last = done >= items.length;
      reconcileList(container, items.slice(0, done), { ...options, keepUnmatched: !last });
      if (!last) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
