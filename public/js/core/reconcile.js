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

// The value a form control's template asks for. Read before the children are
// morphed, because morphing moves `to`'s child nodes (a textarea's text, a
// select's options) into `from`.
function wantedFormState(to) {
  if (to instanceof HTMLInputElement) {
    return to.type === 'checkbox' || to.type === 'radio' ? { checked: to.hasAttribute('checked') } : { value: to.getAttribute('value') ?? '' };
  }
  if (to instanceof HTMLTextAreaElement) return { value: to.textContent };
  if (to instanceof HTMLSelectElement) {
    const selected = [...to.options].find((o) => o.hasAttribute('selected')) || to.options[0];
    return selected ? { value: selected.getAttribute('value') ?? selected.textContent } : null;
  }
  return null;
}

function applyFormState(from, wanted) {
  if (!wanted || from === document.activeElement) return;
  if ('checked' in wanted) {
    if (from.checked !== wanted.checked) from.checked = wanted.checked;
  } else if (from.value !== wanted.value) {
    from.value = wanted.value;
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
  const wanted = wantedFormState(to);
  syncAttributes(from, to);
  morphChildren(from, to);
  applyFormState(from, wanted);
  return from;
}

// Morphs `container`'s children to `markup` (an html`` result or string), for
// a region rendered as one block (the Watching hero) that should still keep
// its nodes, focus and loaded images across re-renders.
export function morphInto(container, markup) {
  const next = container.cloneNode(false);
  next.innerHTML = String(markup);
  morphChildren(container, next);
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

// A reconcile pass over one container. Items are processed in order, in one go
// (reconcileList) or in ranges across frames (reconcileListChunked); each range
// only renders its own items. New elements of a range are parsed from one
// joined string, which is much cheaper than parsing each separately.
function beginPass(container, options) {
  const existing = new Map();
  for (const child of [...container.children]) {
    const k = child.getAttribute('data-key');
    if (k !== null) existing.set(k, child);
    else child.remove();
  }
  return { container, options, existing, cursor: container.firstElementChild, placed: [] };
}

function parseMany(markups) {
  const template = document.createElement('template');
  template.innerHTML = markups.join('');
  const els = [...template.content.children];
  // One element per markup is the contract; if a template broke it, parse
  // them one by one so keys still line up.
  return els.length === markups.length ? els : markups.map((m) => toElement(m));
}

function runRange(pass, items, from, to) {
  const { container, existing, options } = pass;
  const { key, render, onCreate } = options;
  const slots = [];
  const fresh = [];
  for (let i = from; i < to; i++) {
    const k = String(key(items[i], i));
    const markup = String(render(items[i], i));
    let el = existing.get(k);
    if (el) {
      existing.delete(k);
      if (lastHtml.get(el) !== markup) {
        const next = toElement(markup);
        next.setAttribute('data-key', k);
        const morphed = morph(el, next);
        // A different tag replaces the node; keep the cursor on the live one.
        if (morphed !== el && pass.cursor === el) pass.cursor = morphed;
        el = morphed;
        lastHtml.set(el, markup);
      }
      slots.push(el);
    } else {
      const slot = { k, markup, el: null };
      slots.push(slot);
      fresh.push(slot);
    }
  }
  if (fresh.length) {
    const els = parseMany(fresh.map((s) => s.markup));
    fresh.forEach((s, i) => {
      s.el = els[i];
      s.el.setAttribute('data-key', s.k);
      lastHtml.set(s.el, s.markup);
    });
  }
  // Order: move only what is out of place.
  const created = [];
  for (const slot of slots) {
    const el = slot instanceof Element ? slot : slot.el;
    if (el === pass.cursor) {
      pass.cursor = el.nextElementSibling;
    } else {
      container.insertBefore(el, pass.cursor);
    }
    if (!(slot instanceof Element)) created.push(el);
    pass.placed.push(el);
  }
  if (onCreate) for (const el of created) onCreate(el);
}

function endPass(pass, keepUnmatched) {
  if (!keepUnmatched) for (const stale of pass.existing.values()) stale.remove();
  return pass.placed;
}

// Brings `container`'s element children in line with `items`.
//   key(item)          -> stable string id (becomes data-key)
//   render(item, i)    -> html`` result / string for ONE element
//   onCreate(el)       -> optional, called for brand-new elements only, once
//                         they are in the document
//   keepUnmatched      -> leave keyed children that are not in `items` in place
//                         after the wanted ones
// Children without a data-key are always removed.
export function reconcileList(container, items, options = {}) {
  const pass = beginPass(container, options);
  runRange(pass, items, 0, items.length);
  return endPass(pass, options.keepUnmatched);
}

// Code that changes a reconciled element's DOM directly (swapping a label for an
// input, say) calls this so the next reconcile morphs the element back to its
// template even if the template output did not change.
export function forget(node) {
  for (let n = node; n; n = n.parentElement) lastHtml.delete(n);
}

// Same as reconcileList, but only the first `firstCount` items synchronously and
// the rest in chunks on later frames, so a large list paints its first screen
// immediately. Elements beyond the first screen that are already there stay put
// until their chunk reaches them (nothing flashes away); leftovers are removed
// after the last chunk. A newer call on the same container cancels chunks still
// pending from an older one.
const pendingChunks = new WeakMap();
export function reconcileListChunked(container, items, options = {}, { firstCount = 60, chunkSize = 400 } = {}) {
  const token = {};
  pendingChunks.set(container, token);
  const pass = beginPass(container, options);
  const first = Math.min(firstCount, items.length);
  runRange(pass, items, 0, first);
  if (first >= items.length) {
    endPass(pass, options.keepUnmatched);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = first;
    const step = () => {
      if (pendingChunks.get(container) !== token) return resolve();
      const to = Math.min(items.length, done + chunkSize);
      runRange(pass, items, done, to);
      done = to;
      if (done < items.length) requestAnimationFrame(step);
      else {
        endPass(pass, options.keepUnmatched);
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}
