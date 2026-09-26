// Auto-escaping HTML templates (v3 Phase 2). Escaping is the default instead of
// a discipline: every value interpolated into html`` is escaped unless it is
// itself an html`` result (or explicitly marked raw()). v2 built markup with
// plain template strings and called escapeHtml() by hand at each site, which is
// how a cover path ended up unescaped inside url('...').
//
//   html`<b title="${name}">${name}</b>`       -> both escaped
//   html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`  -> nested, arrays joined
//   html`<div style="background-image:${cssUrl(path)}"></div>` -> safe CSS url()
//
// Values: null/undefined/false render as nothing (so `${cond && html`...`}`
// works), numbers and strings are escaped, arrays are flattened.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => ESCAPES[c]);
}

export class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

// Marks a string as already-safe markup. Only for markup this app generated
// itself (static SVG icons and the like), never for data.
export function raw(markup) {
  return new SafeHtml(String(markup ?? ''));
}

function renderValue(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

// A CSS url() for an inline style attribute. The value goes inside a quoted CSS
// string, so quotes, backslashes and newlines are CSS-escaped first; html``
// then HTML-escapes the whole thing for the attribute. Returns SafeHtml because
// the result is already attribute-safe.
export function cssUrl(value) {
  const css = String(value ?? '').replace(/[\\"'\n\r()]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);
  return new SafeHtml(escapeHtml(`url("${css}")`));
}

// Joins class names, dropping falsy ones: cls('card', selected && 'selected').
export function cls(...names) {
  return names.filter(Boolean).join(' ');
}

// Parses an html`` result into a single element (the first element child).
export function toElement(markup) {
  const template = document.createElement('template');
  template.innerHTML = String(markup).trim();
  return template.content.firstElementChild;
}
