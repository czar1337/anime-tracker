# Handover — Moonlit Shrine redesign

**Anime Tracker 1.8.1 → 1.9.0 · 27/07/2026**

This is the build brief. Read `moonlit-shrine-design-system.md` first; it is the source of truth for every visual decision. This file covers what to change, in what order, and how to know a phase is finished.

---

## 1 · What this is

A local anime tracker. Node server, no dependencies, no build step, vanilla ES modules in the browser. It runs offline except for AniList search and Discover. Data lives outside the program folder and must never be touched by this work.

The redesign replaces the visual layer: one new theme as default, 45 regenerated themes, two new fonts, a real type scale with user controls, press and hold interactions, and designs for fourteen surfaces that previously had none.

**It is not a rewrite.** The data model, the server, the storage format, the migrations and the tests stay as they are.

---

## 2 · Files you will touch

| File | What happens |
|---|---|
`public/styles.css` | The bulk of the work. Replace the 40 theme blocks with an import of the generated file, rewrite component rules against the new tokens |
`public/moonlit-shrine-themes.css` | **New.** Generated. Do not hand-edit |
`scripts/generate-themes.js` | **New.** The generator. Keep it, so a new theme is four numbers |
`public/fonts/` | Add five woff2 files plus `zen-old-mincho.css` and `schibsted-grotesk.css`. Remove `sora*` and `inter*` last, once nothing references them |
`public/index.html` | Add Home view markup, the settings panel, the help panel, the two banners, the bulk bar. Set `data-text-size` and `data-text-weight` in the head script next to the existing theme line |
`public/js/themes.js` | Extend to also store text size, text weight and decoration level |
`public/js/render.js` | Card states, skeletons, windowed rendering, hold-to-select |
`public/js/detail.js` | Episode squares plus the >50-episode fallback, original title line |
`public/js/discover.js` | Horizontal cards with a reason line, dismissed list |
`public/js/malImport.js`, `screenshotImport.js` | Three-step layout, match confidence, uncertain rows unchecked by default |
`public/js/notifications.js` | Split into a header list plus a setting |
`public/js/statsExport.js` | Read theme colours from `getComputedStyle`, wait for `document.fonts.ready` |
`public/js/events.js` | Press, hold, drag, new shortcuts (`s`, `ctrl+z`, `1`–`7`) |
`public/js/app.js` | Home view wiring |
`version.json`, `package.json`, `CHANGELOG.md` | Version bump to 1.9.0 at the end |

## 3 · Files you must not touch

`server.js` · `datadir.js` · `migrations.js` · `data/**` · `tests/**` (except adding tests) · the storage format in `library.json` · anything under the user's data directory.

If a design seems to require a data change, stop and ask. It almost certainly does not.

---

## 4 · Order of work

Each phase ends with `npm test` passing and the app starting cleanly. Do not start a phase before the previous one is verified.

### Phase 1 — Foundation
Fonts local, tokens in place, themes generated, nothing else changed.

- Add the five woff2 files and their two `@font-face` files, Latin subset only.
- Run `node scripts/generate-themes.js`, output to `public/moonlit-shrine-themes.css`, link it from `styles.css`.
- Add the `:root` block from §15 of the design system.
- Set `data-color-theme` default to `moonlit-shrine`, keep the existing localStorage read.
- Add `data-text-size` and `data-text-weight` to the head script.

**Done when:** the app looks broadly like today but in the new colours and fonts, every existing theme key still resolves, and switching text size visibly changes every size in the app. No console errors. `npm test` green.

### Phase 2 — The screens you use daily
Header, tabs, filter bar, card grid, hero, Home.

- Rewrite the header: wordmark, save indicator with three states, icon buttons, primary button.
- Filter bar in two rows plus the active-filter row, with the visible result count.
- Card: six states, hover choreography, plus button, press scale, skeleton.
- Hero with both modes: new episode, and "Pick up where you left off".
- Home view: hero, up to four cards, up to three entries under Tonight, three numbers.
- Grid columns follow text size. Card titles clamp to two lines above size `m`.

**Done when:** all of Watching, Home and the filter bar match the reference, at three text sizes, in a dark theme and a light theme. `npm test` green.

### Phase 3 — Depth and dialogue
Detail view, toasts, dialogs, empty states, search, settings, help.

- Detail view with episode squares, the >50-episode fallback, score, status, note, original title in Mincho italic.
- Toast with Undo. Confirm dialogs that name what is kept.
- Search overlay: results, loading skeleton, no-results, offline message.
- Settings panel: theme grid, text size, text weight, decoration, original titles. Replaces `#theme-picker-overlay`.
- Help panel behind `?` with three tabs, copy taken verbatim from the reference. Replaces `#shortcuts-overlay`.

**Done when:** every overlay traps focus, closes on `esc`, and restores focus. The help panel answers the ten questions. `npm test` green.

### Phase 4 — Interaction and atmosphere
The part that can be removed without breaking anything, so it comes last.

- Press scales and pointer-positioned ripples on all controls.
- Hold 500 ms to enter select mode, plus the bulk bar and its confirm dialogs.
- Tab underline that slides. Drag to reorder, if reordering exists.
- Atmosphere: moon glow, canopy, five leaves, ambient feather every 42 s, reward feather on a finished series.
- `data-decor` on, half, off. `prefers-reduced-motion` and `hover:none` handling.

**Done when:** at most six animated elements at once, all on transform and opacity, and the app holds 60 fps while scrolling a 300-series library. Decoration off removes all of it. `npm test` green.

### Phase 5 — The rest
Schedule, Stats, the stats image, Discover, import, screenshot import, backup menu, banners, recovery and blocked screens.

- Discover: horizontal cards, reason line, dismiss, dismissed list.
- Import and screenshot import: three steps, confidence colours, uncertain rows unchecked, backup before commit.
- Stats image: colours from `getComputedStyle`, fonts ready before draw.
- Recovery and blocked screens: plain, no accent fills, no decoration.

**Done when:** every row in §16 of the design system is either done or explicitly deferred with a note. Bump to 1.9.0, write the changelog.

---

## 5 · Two things to check before phase 2

1. **Cover treatment against the real library.** Load 30 real covers, especially light and white ones. If the grid looks washed out, lower `brightness` in `--cover-filter` to about `.82` and regenerate. This is the single most likely thing to look wrong.
2. **Tab row width.** Eight tabs in English at text size `xl` on a 1280 px window. If it does not fit, make the row scroll horizontally. Do not shrink the type.

---

## 6 · Rules that are easy to break

- `--accent` is never a text colour. Accent text uses `--accent-lit`. Accent fills use `--accent-fill` with `--accent-contrast`.
- Never hardcode a colour. If a value is not a token, it is a bug.
- Never hardcode a font size. Use the `--t-*` tokens so text controls keep working.
- Mincho never below 17 px and never uppercase.
- One primary button per view. One hero per screen.
- Decoration never covers text and never sits above content in z-order.
- Only `transform` and `opacity` are animated in loops.
- No new dependencies. No build step. The app must still open by double-clicking `start.bat`.
- Keep all 40 existing theme keys working, so saved settings survive the update.

---

## 7 · Acceptance checklist

Run through this before calling the work done.

**Function**
- [ ] `npm test` passes
- [ ] App starts with `npm start` and opens at `http://localhost:4321`
- [ ] Existing `library.json` loads unchanged, no migration triggered
- [ ] A saved theme from 1.8.1 still resolves after the update
- [ ] Export, then restore, produces an identical library
- [ ] Works with the network off: library, schedule, stats, backups all fine; search and Discover fail with the designed message

**Visual**
- [ ] Six themes checked, including two light ones: `moonlit-shrine`, `bloom`, `frost`, `ember`, `parchment`, `daybreak`
- [ ] Five text sizes checked on Watching and on the detail view
- [ ] Four text weights checked on the card grid
- [ ] No hardcoded hex values remain in `styles.css` outside the generated theme file
- [ ] Mincho appears only at 17 px and above, never uppercase

**Interaction**
- [ ] Every control has a visible focus ring, reachable by keyboard
- [ ] All ten shortcuts work, and none fire while typing in a field
- [ ] Hold a card for 500 ms enters select mode; `esc` leaves it
- [ ] Every destructive action confirms and says what is kept
- [ ] Undo works for the last episode change

**Accessibility and performance**
- [ ] `prefers-reduced-motion` removes all animation and the atmosphere
- [ ] `hover:none` drops hover states and strengthens press
- [ ] Scrolling a 300-series library stays smooth
- [ ] No layout shift when the theme or text size changes

---

## 8 · Kickoff prompt

Paste this into Claude Code in the project root:

> Read `design/moonlit-shrine-design-system.md` and `design/HANDOVER.md` in full before writing any code.
>
> We are redesigning the visual layer of this app to the Moonlit Shrine design system. It is not a rewrite: the server, data model, storage format, migrations and tests stay as they are. Do not touch `server.js`, `datadir.js`, `migrations.js`, `data/`, or anything in the user's data directory.
>
> Work in the five phases described in HANDOVER §4, one phase per commit. Do not start a phase until the previous one passes `npm test` and starts cleanly. After each phase, list what you changed and what you deliberately left for later.
>
> Start with phase 1 only: local fonts, the token block, the generated theme file, and the three `data-` attributes in the head script. Show me the diff before moving on.
>
> Two rules that matter more than the rest: never hardcode a colour or a font size, everything goes through tokens; and `--accent` is never a text colour, accent text uses `--accent-lit` while accent fills use `--accent-fill` with `--accent-contrast`.
>
> If the design system is silent on something, ask instead of inventing.

---

## 9 · Suggested repo layout

```
anime-tracker/
├── design/
│   ├── moonlit-shrine-design-system.md      ← source of truth
│   ├── HANDOVER.md                          ← this file
│   ├── theme-contrast-audit.md
│   └── reference/                           ← the four HTML references
├── scripts/
│   ├── build-exe.js
│   └── generate-themes.js                   ← new
└── public/
    ├── moonlit-shrine-themes.css            ← generated
    ├── styles.css
    └── fonts/
        ├── zen-old-mincho.css
        ├── zen-old-mincho-600.woff2
        ├── zen-old-mincho-700.woff2
        ├── schibsted-grotesk.css
        └── schibsted-grotesk-400/500/600.woff2
```

---

## 10 · Font sources

Both families are SIL Open Font License 1.1 and may be bundled.

- Zen Old Mincho — Google Fonts, weights 600 and 700, Latin subset
- Schibsted Grotesk — Google Fonts, weights 400, 500 and 600, Latin subset

Download the woff2 files, place them in `public/fonts/`, and write `@font-face` blocks in the same pattern as the existing `inter.css`, including `unicode-range` for the Latin subset and `font-display: swap`. Do not link to Google Fonts from the app: it must work offline. The HTML reference files do link to Google Fonts, but they are documentation and never shipped.

---

## 11 · Known open items

| Item | Decision |
|---|---|
| Japanese subset for original titles | Loads only when the user picks "everywhere". About 4 MB, once |
| Light-theme atmosphere | Header glow only. Leaves look like dirt on white |
| Drag to reorder | Designed, but only build it if a manual sort order already exists |
| Undo beyond the last action | Out of scope. Bulk edits rely on the confirm dialog |
| Mobile below 768 px | Two columns and a stacked hero are specified, but the app is desktop first and this is untested |
