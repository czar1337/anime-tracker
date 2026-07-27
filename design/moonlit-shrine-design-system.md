# Moonlit Shrine — design system

**Version 1.2 · 27/07/2026 · Anime Tracker**

This document replaces profile 1.0 and profile 1.1. Where they disagree, this file wins.

Moonlit Shrine is a dark, quiet interface for a local anime tracker. The mood is a night shrine in autumn: blue-black surfaces, one warm red accent, red leaves and a crow feather drifting slowly behind the content. Serious and restrained, never loud.

Interface language is **English, plain and short**. See §12.

---

## Contents

1. Principles
2. Brand
3. Colour and themes
4. Typography
5. Spacing, grid and radius
6. Surfaces and depth
7. Icons
8. Components and states
9. Cover art treatment
10. Motion, hover, press and hold
11. Atmosphere
12. Copy and tone
13. Accessibility
14. Awkward data
15. Tokens
16. Surface inventory
17. Deliverables

---

## 1 · Principles

1. **Darkness is the room, not the theme.** The background is near-empty. Anything that glows means something: a new episode, an active tab, progress that moved. Decoration never glows brighter than information.
2. **The accent is rare.** At most three accent-coloured areas per screen. When everything is red, nothing means anything, and seriousness turns into aggression.
3. **Covers are muted at rest.** AniList covers clash with each other. At rest saturation and brightness drop so the grid reads as one surface. Hover restores full colour, which turns attention into an action.
4. **Motion breathes.** Ambient motion is slow, sparse and translucent. Rewards are short and happen where the action happened. No flash, no screen shake, nothing that makes you wait.
5. **Typography carries the seriousness.** Mincho in large headings, grotesque in everything small. Hierarchy comes from size, colour and air, never from more fonts or more colours. A flat screen needs space, not effects.

---

## 2 · Brand

The mark is a waning moon with a feather falling through it. The moon is the night, the feather is the reward animation and the Itachi reference. The accent appears only as a thin line in the feather's shaft, so the mark still reads at 16 px.

| Use | Size | Detail |
|---|---|---|
| App icon | 256 / 128 / 64 px | moon + feather + hairline frame |
| Header | 19 px wordmark, 7 px dot | accent dot is enough |
| Favicon | 32 / 16 px | moon + dot, no feather |
| Minimum lockup width | 96 px | below that, mark only |

Clear space: one moon radius on all sides. Nothing enters it, including decoration.

Never: skew or stretch it, place it on an accent fill, change its typeface, add glow or shadow.

---

## 3 · Colour and themes

### 3.1 Token roles

| Token | Role |
|---|---|
`--bg`, `--bg-deep`, `--bg-elevated` | The room, deepest layer, overlay surfaces
`--card`, `--card-hover` | Card at rest and under the pointer
`--line`, `--line-lit` | Hairlines; `line-lit` only on hover, focus and overlays
`--text`, `--dim`, `--faint` | Primary, secondary, labels
`--accent` | Indicators, progress, borders, active underline
`--accent-lit` | **All accent-coloured text and icons**
`--accent-fill` | Accent as a filled surface behind text
`--accent-contrast` | The text colour that sits on `--accent-fill`
`--accent-soft` | Accent at 12 % opacity, for tinted backgrounds
`--accent-deep` | Dropped series, dimmed progress. Never text
`--support` | Neutral interaction, calm hero state, informational banners
`--positive` | Saved, finished, airing now
`--warning` | Old backup, missing data, import conflicts
`--glow` | Moonlight in the atmosphere layer only
`--deco` | Leaves and canopy only. Never interface
`--cover-filter`, `--cover-filter-hover` | Per-theme cover treatment

**Two hard rules.** `--accent` is never a text colour — use `--accent-lit`. Filled accent surfaces use `--accent-fill` with `--accent-contrast`, at weight 500 or heavier and never below 12 px.

### 3.2 The theme engine

45 themes, all generated from four parameters each: base hue and saturation, accent, glow, decoration. Nineteen tokens are derived with fixed lightness steps that are identical in every theme.

| Derivation | Rule |
|---|---|
| Surfaces, dark | L = 5 · 9 · 10.5 · 13.5 · 17 · 27 % |
| Surfaces, light | L = 96 · 99 · 100 · 97 · 89 · 74 % |
| `--text` / `--dim` / `--faint` | raised until 12:1 / 7:1 / 4.6:1 against `--bg` |
| `--accent-lit` | shifted until ≥ 4.6:1 against `--bg` |
| `--accent-fill` | lightness nudged until `--accent-contrast` clears 4.6:1 |
| `--accent-deep` | accent with L × 0.55 |

Source of truth: `scripts/generate-themes.js`. Output: `public/moonlit-shrine-themes.css` and `theme-contrast-audit.md`. Adding a theme is four numbers, not nineteen hex values. **Do not hand-edit the generated CSS.**

### 3.3 Measured result across all 45 themes

| Metric | Worst case |
|---|---|
| `--text` on `--bg` | 14.8:1 |
| `--dim` on `--bg` | 7.0:1 |
| `--faint` on `--bg` | 4.6:1 |
| `--accent-lit` on `--bg` | 4.8:1 |
| `--accent-contrast` on `--accent-fill` | 4.6:1 |

Failures: none. Four themes are light: `radiant`, `parchment`, `clean-interface`, `daybreak`. Default: `moonlit-shrine`. All 40 keys from the current app are kept, so saved settings keep working.

### 3.4 Ink distribution

Roughly 72 % surfaces, 18 % lines and text, 7 % support colours, 3 % accent. If the accent covers more than about three percent, something is wrong. Squint: the screen should read as dark with a few embers.

---

## 4 · Typography

**Zen Old Mincho** carries the brand and large headings. **Schibsted Grotesk** carries everything else. Both are SIL OFL and bundled locally, so the app still works offline.

Mincho is never used below 17 px and never in capitals: its Latin capitals go flat and its serifs fill in at small sizes.

### 4.1 Scale

User-controlled, so every size is a multiple of `--text-scale` and every weight goes through a weight variable.

| Token | Spec | Used for |
|---|---|---|
| `--t-display-l` | Mincho, `--w-display`, 30 px / 1.16, +0.015em | Hero title, big numbers in stats |
| `--t-display-m` | Mincho, `--w-display`, 21 px / 1.24, +0.015em | Detail title, view heading, empty state |
| `--t-display-s` | Mincho, `--w-display`, 19 px / 1.2, +0.055em | Wordmark only |
| `--t-body` | Grotesk, `--w-body`, 13 px / 1.62 | Notes, running text, toasts |
| `--t-action` | Grotesk, `--w-med`, 12.5 px | All buttons |
| `--t-card` | Grotesk, `--w-med`, 12 px / 1.3 | Card titles, times |
| `--t-meta` | Grotesk, `--w-body`, 11 px / 1.5 | Secondary lines, chips, help text |
| `--t-micro` | Grotesk, `--w-med`, 10.5 px, +0.16em, caps | Tabs, labels |
| `--t-nano` | Grotesk, `--w-med`, 9.5 px, +0.22em, caps | Kickers, smallest labels |

### 4.2 User controls

`data-text-size` on `<html>`: `xs` 0.92 · `s` 1 · `m` 1.08 · `l` 1.18 · `xl` 1.32.

`data-text-weight` on `<html>`:

| Level | `--w-body` | `--w-med` | `--w-strong` | `--w-display` |
|---|---|---|---|---|
| `light` | 400 | 400 | 500 | 400 |
| `normal` | 400 | 500 | 600 | 600 |
| `clear` | 500 | 600 | 600 | 600 |
| `bold` | 500 | 600 | 700 | 700 |

Both are stored in localStorage and set synchronously in `<head>`, exactly as the theme already is, so nothing jumps on load.

Layout follows the scale: card art height is `calc(126px * var(--text-scale))`, and grid columns drop from 6 to 5 to 4 at `l` and `xl`. Card titles clamp to two lines above `m`. The tab row scrolls horizontally when it no longer fits.

### 4.3 Numbers and italics

All numerals use `font-variant-numeric: tabular-nums`. Mincho italic is used in exactly one place: the original Japanese title in the detail view.

### 4.4 Font files

`zen-old-mincho-600.woff2`, `zen-old-mincho-700.woff2`, `schibsted-grotesk-400/500/600.woff2`. About 145 kB total for the Latin subset, same `@font-face` pattern as the existing `inter.css`. Sora and Inter can be removed. The Japanese subset (several MB) loads only when the user turns on original titles everywhere.

---

## 5 · Spacing, grid and radius

Everything is a multiple of 4, with 8 as the base step: 4, 8, 12, 16, 24, 32, 48, 64. Four inside a component, 8–16 between components, 24–32 between groups, 48–64 between sections. Page padding is 26 px, the one exception, so the card grid lands evenly at 1440 px.

| Width | Columns | Card width |
|---|---|---|
| ≥ 1600 | 7 | ~198 px |
| 1280–1599 | 6 | ~192 px |
| 1024–1279 | 5 | ~184 px |
| 768–1023 | 4 | ~168 px |
| < 768 | 2 | flexible, hero stacks |

Radius: 4 chips inside cards · 7 buttons and fields · 11 cards · 12 panels · 16 hero and dialogs · 999 tags and toasts.

Proportions: card art is 3:2 landscape cropped from the AniList portrait, 126 px tall at 192 px wide. List and schedule thumbnails are 3:4 portrait at 32 × 44 px. The hero is 268 px tall on the library view, 210 px on Home.

---

## 6 · Surfaces and depth

Depth is built with surface, then line, then shadow. Glow is a fourth tool and only for something that is genuinely active.

| Level | Surface | Line | Shadow | Example |
|---|---|---|---|---|
| 0 room | `--bg` | — | — | App background |
| 1 card | `--card` | `--line` | `--sh-1` | Series cards, stat panels |
| 2 raised | `--card-hover` | `--line-lit` | `--sh-3` + glow | Card under the pointer |
| 3 overlay | `--bg-elevated` | `--line-lit` | `--sh-2` | Detail view, dialogs, toasts |
| 4 hero | cover + gradient | accent 28 % | glow 48 px | One per screen, never more |

`backdrop-filter: blur(6px)` is allowed in exactly three places: the overlay backdrop, the toast, and the plus button on cards.

---

## 7 · Icons

One stroke, never a fill. 24 px canvas, 1.5 px stroke, round caps and joins, no detail below 2 px. `--dim` at rest, `--text` or `--accent-lit` on hover, never multicoloured.

Set: search, add, notification, schedule, stats, import, export, filter, sort, done, close, score, feather (the mark), history, delete, settings.

---

## 8 · Components and states

Every component defines rest, hover, focus, press and disabled. Focus is always a 2 px accent ring at 2 px offset via `:focus-visible`, on every control, and is never removed without a replacement. Hit areas are at least 28 × 28 px, ideally 32.

**Buttons, four levels.** Primary (`--accent-fill`, one per view), ghost (line plus faint surface), quiet (line only), danger (accent line, `--accent-lit` text). Loading state replaces the label with a spinner and keeps the button width.

**Fields.** `--line` border, radius 7. Hover lifts to `--line-lit`, focus sets the accent border and `--accent-soft` background. Shortcut hints sit right-aligned in a `kbd`.

**Chips.** Pills at 11 px. Selected chips take the accent line and soft fill, and active filters get a removable ×.

**Tags.** New episode (accent fill), Airing now (positive line), Finished (support line), Dropped (accent line).

**Tabs.** Caps in `--t-micro`, active tab in `--text` with an accent underline that slides between positions over 240 ms. Counts in tabular numerals.

**Series card, six states.** Normal · new episode (accent dot top left) · finished (support-coloured progress, 26/26) · dropped (opacity 0.55, `--accent-deep` progress) · selected (accent border plus filled check) · skeleton while loading.

**Feedback.** Toast pill at the bottom with Undo, tooltip on `--bg-elevated`, confirm dialog for anything destructive that always names what is kept, empty state with a Mincho heading and two actions.

**Filter bar.** Two rows plus an active-filter row. Only five genre chips are shown; the rest sit behind "All genres" with a count. The result count is always visible while a filter is active.

**Select mode and bulk bar.** Entered from the toolbar button, the `s` key, or holding a card for 500 ms. The bar sits above the grid, never floating over content. Bulk edits always confirm first.

Visual reference for all of the above: `27-07-2026-moonlit-shrine-grafisk-profil.html` §08 and `27-07-2026-moonlit-shrine-remaining-surfaces.html`.

---

## 9 · Cover art treatment

| Rule | Value |
|---|---|
| Rest | `--cover-filter`, dark themes `saturate(.66) brightness(.9) contrast(1.05)` |
| Hover | `--cover-filter-hover`, dark themes `saturate(.96) brightness(1) contrast(1.03)`, 420 ms |
| Light themes | `saturate(.8) brightness(.96) contrast(1.02)` → `saturate(1) brightness(1) contrast(1)` |
| Scrim on card art | `linear-gradient(transparent 50%, colour-mix(--card 92%, black))` |
| Hero scrim | `linear-gradient(100deg, bg .94, bg .68 52%, bg .35)` |
| Missing cover | First letter in Mincho at 22 % opacity on a flat panel. Never an empty box or a stock icon |

**This is the most fragile part of the system.** The values are tuned against gradients, not real covers. Test against the real library before phase 2 and expect very light covers to need `brightness(.82)`.

---

## 10 · Motion, hover, press and hold

Easings: `--e-out cubic-bezier(.2,1,.3,1)` default · `--e-spring cubic-bezier(.2,1.5,.3,1)` plus button and rewards only · `--e-inout cubic-bezier(.4,0,.2,1)` colour and opacity · `--e-press cubic-bezier(.3,0,.6,1)` press down.

Durations: `--d-press 90ms` · `--d-1 120ms` · `--d-2 200ms` · `--d-3 280ms` · `--d-4 380ms` · `--d-5 800ms`.

Press scales: `--press-btn .97` · `--press-icon .90` · `--press-card .995` · `--press-chip .95`.

| Event | Duration | Easing | What moves |
|---|---|---|---|
| Card hover | 380 ms | `--e-out` | Lift 5 px, hairline draws across the top, cover gains colour, plus button eases in |
| Any press | 90 ms down, 200 ms back | `--e-press` / `--e-out` | Scale per token, plus a ripple starting at the pointer position |
| Hold a card | 500 ms | linear ring | Ring fills, then select mode |
| Focus ring | 120 ms | `--e-inout` | Ring fades in, nothing moves |
| Tab change | 240 ms | `--e-out` | The single underline slides |
| Mark episode | 280 ms + 1.1 s | `--e-spring` | Progress grows, accent ripple at the pointer, toast rises |
| Series finished | 2.4 s | `--e-out` | Ripple plus one feather drifting down from the card |
| Overlay open | 340 ms | `--e-out` | Opacity plus 14 px up and scale 0.985 → 1 |
| Toast | 300 ms in, 4.2 s visible | `--e-out` | Rises from the bottom, leaves by itself |
| Drag | 280 ms | `--e-out` | Lift 8 px, tilt 2.5°, full shadow. Reordering only, never status changes |

Forbidden: flash, screen shake, glitch, mouse-following parallax, counting numbers, anything above 2.5 s, and motion that blocks a click target.

`@media (hover:none)`: hover states are dropped and press scales step up one level, since a finger hides the feedback. Holding becomes the primary route into select mode.

`prefers-reduced-motion: reduce`: every press animation becomes a 120 ms opacity change, the hold ring fills without animation, and the atmosphere layer turns off.

---

## 11 · Atmosphere

Four layers, back to front: moon glow, canopy, leaves and feathers, grain and vignette.

| Layer | Count | Duration | Opacity |
|---|---|---|---|
| Leaves | 5 | 19–27 s | 0.26–0.40 |
| Feather, ambient | 1 every 42 s | 26–36 s | 0.22–0.30 |
| Feather, reward | 1 per finished series | 2.4 s | 0.95 |
| Moon glow | 1 | static | 0.17 |
| Canopy | 4 fields | static, blur 24 | 0.19–0.30 |

`data-decor="on | half | off"` on `<html>`. Half drops opacity to 45 %. Off removes leaves, feathers and canopy but keeps the moon glow and vignette. `prefers-reduced-motion` forces off.

Performance budget: at most six animated elements at once, all on `transform` and `opacity` only. No animated `filter` or `box-shadow` in a loop.

In light themes the decoration is limited to the header glow. Leaves on a near-white background read as dirt.

---

## 12 · Copy and tone

English, plain language, short sentences. The app says what happened, never how well you did. No exclamation marks, no emoji, no encouragement.

| Situation | Say | Not |
|---|---|---|
| Episode marked | Frieren episode 19 marked watched | Nice work! One step closer! |
| Series finished | Mushishi finished · moved to Watched | Congratulations, you did it! |
| New episode | New episode · 3 hours ago | Don't miss this! |
| Empty list | Nothing here yet | Oops, looks empty in here! |
| Error | Could not reach AniList. Your library is unchanged. | Something went wrong :( |
| Destructive | Moves to Dropped. Watched episodes and your score are kept. | Are you sure? |

### Core strings

| Area | String |
|---|---|
| Tabs | Home · Watching · Watchlist · Watched · Dropped · Schedule · Discover · Stats |
| Primary actions | Add series · Mark episode {n} watched · Open series · Import · Export my library |
| Hero, new episode | New episode · {time} ago |
| Hero, calm | Pick up where you left off |
| Progress | Episode {n} of {total} watched · {left} to go |
| Unknown total | {n} watched · no total known |
| Select mode | {n} selected · Select all {n} · Cancel |
| Save states | Saved · Saving · Not saved. Retrying. |
| Undo | Undo |
| Help tabs | The basics · Keyboard · Questions |

Full FAQ copy is in `27-07-2026-moonlit-shrine-remaining-surfaces.html` §07 and must be used verbatim.

---

## 13 · Accessibility

- Focus: 2 px accent ring, 2 px offset, `:focus-visible`, never removed.
- Contrast: verified per theme by the generator, worst case 4.6:1 for labels. See §3.3.
- Colour is never the only carrier: a new episode has a dot **and** the words, finished has support-coloured progress **and** 26/26, dropped has reduced opacity **and** a tag.
- Text size and weight are user controls, not a zoom hack, and apply on the safety screens too.
- Keyboard: `/` search · `n` add · `1`–`7` tabs · `j` `k` move between cards · `space` mark next episode · `enter` open · `s` select mode · `esc` close or leave select mode · `ctrl+z` undo · `?` help. Shortcuts are inactive while typing in a field.
- All overlays trap focus, restore it on close, and close on `esc`.
- `aria-live="polite"` on the toast container, `aria-selected` on tabs, `aria-pressed` on select mode.

---

## 14 · Awkward data

| Case | Behaviour |
|---|---|
| No total episode count | `1104 / ?` and a striped bar. Percentage is never guessed |
| No cover | Mincho initial at 22 % on a flat panel |
| Long title | One line up to size `m`, two lines and clamp above. Full title in tooltip and detail view |
| Very light cover | Per-theme `--cover-filter`; expect `brightness(.82)` for light covers |
| No score | Em dash. Never zero, never empty stars |
| More than 50 episodes | Episode squares become a compact bar plus a "jump to episode" field |
| Library over 300 series | Grid renders in windows of 60 cards, covers load lazily, filters run on a copy |
| Duplicate titles | Year appended in the meta line, never in the title |
| Unreadable library file | Recovery screen: state the fact, name the file, list backups, change nothing |
| Two data folders | Blocked screen: show both paths and counts, offer no guess |

---

## 15 · Tokens

```css
:root{
  /* form */
  --radius-xs:4px; --radius-sm:7px; --radius:12px; --radius-lg:16px;
  --sh-1:0 2px 8px -2px rgba(0,0,0,.5);
  --sh-2:0 12px 28px -14px rgba(0,0,0,.8);
  --sh-3:0 22px 42px -22px rgba(0,0,0,.95);

  /* type families */
  --display:"Zen Old Mincho",Georgia,serif;
  --ui:"Schibsted Grotesk",system-ui,sans-serif;

  /* user-controlled typography */
  --text-scale:1;
  --w-body:400; --w-med:500; --w-strong:600; --w-display:600;
  --fs-display-l:calc(30px * var(--text-scale));
  --fs-display-m:calc(21px * var(--text-scale));
  --fs-display-s:calc(19px * var(--text-scale));
  --fs-body:calc(13px * var(--text-scale));
  --fs-action:calc(12.5px * var(--text-scale));
  --fs-card:calc(12px * var(--text-scale));
  --fs-meta:calc(11px * var(--text-scale));
  --fs-micro:calc(10.5px * var(--text-scale));
  --fs-nano:calc(9.5px * var(--text-scale));
  --t-display-l:var(--w-display) var(--fs-display-l)/1.16 var(--display);
  --t-display-m:var(--w-display) var(--fs-display-m)/1.24 var(--display);
  --t-display-s:var(--w-display) var(--fs-display-s)/1.2 var(--display);
  --t-body:var(--w-body) var(--fs-body)/1.62 var(--ui);
  --t-action:var(--w-med) var(--fs-action)/1 var(--ui);
  --t-card:var(--w-med) var(--fs-card)/1.3 var(--ui);
  --t-meta:var(--w-body) var(--fs-meta)/1.5 var(--ui);
  --t-micro:var(--w-med) var(--fs-micro)/1 var(--ui);
  --t-nano:var(--w-med) var(--fs-nano)/1 var(--ui);
  --tr-display:.015em; --tr-brand:.055em; --tr-micro:.16em; --tr-nano:.22em;

  /* motion */
  --e-out:cubic-bezier(.2,1,.3,1);
  --e-spring:cubic-bezier(.2,1.5,.3,1);
  --e-inout:cubic-bezier(.4,0,.2,1);
  --e-press:cubic-bezier(.3,0,.6,1);
  --d-press:90ms; --d-1:120ms; --d-2:200ms; --d-3:280ms; --d-4:380ms; --d-5:800ms;
  --press-btn:.97; --press-icon:.90; --press-card:.995; --press-chip:.95;

  /* rhythm */
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px;
  --sp-6:24px; --sp-8:32px; --sp-12:48px; --sp-16:64px;
}

[data-text-size="xs"]{--text-scale:.92}
[data-text-size="s"] {--text-scale:1}
[data-text-size="m"] {--text-scale:1.08}
[data-text-size="l"] {--text-scale:1.18}
[data-text-size="xl"]{--text-scale:1.32}

[data-text-weight="light"] {--w-body:400;--w-med:400;--w-strong:500;--w-display:400}
[data-text-weight="normal"]{--w-body:400;--w-med:500;--w-strong:600;--w-display:600}
[data-text-weight="clear"] {--w-body:500;--w-med:600;--w-strong:600;--w-display:600}
[data-text-weight="bold"]  {--w-body:500;--w-med:600;--w-strong:700;--w-display:700}

@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation:none!important;transition:none!important}
}
```

Colour tokens are not listed here. They live per theme in the generated `public/moonlit-shrine-themes.css` — 45 blocks of 21 tokens.

---

## 16 · Surface inventory

Checked against `public/index.html` and `public/js/*`. Every element in the app has a design or a written decision.

| Element in the app | Status |
|---|---|
`#home-view` | New design, §09 of remaining-surfaces
`#list-view`, `#grid.card-grid`, `#empty-state` | Designed
`.filter-bar`, `#active-filter-chips` | New design
`#bulk-action-bar`, `#select-mode-toggle` | New design, plus hold-to-select
`#discover-view`, `#dismissed-overlay` | New design
`#schedule-view`, `#stats-view` | Designed in prototype v0.5.1
`#stats-share-overlay` + canvas | New design; colours read from `getComputedStyle` at draw time
`#detail-overlay` | Designed, plus the >50-episode case
`#search-overlay` | New design, including loading and no-results states
`#screenshot-overlay` | New design, three steps
`#import-overlay` | New design, three steps with match confidence
`#theme-picker-overlay` | Replaced by the settings panel
`#shortcuts-overlay` | Replaced by Help → Keyboard
`#notifications-overlay` | Split: episode list in the header, on/off in settings
`#backup-overlay`, `#backup-menu-trigger` | New design
`#recovery-overlay`, `#blocked-overlay` | New design, deliberately plain
`#update-banner`, `#error-banner` | New design
`#save-indicator` | New design, three states
`#toast-container` | Designed
`#app-version` | Unchanged, moves into settings

---

## 17 · Deliverables

| File | Contents |
|---|---|
`moonlit-shrine-design-system.md` | This document. The single source of truth |
`moonlit-shrine-themes.css` | 45 generated themes, ready for `public/` |
`generate-themes.js` | Theme generator, belongs in `scripts/` |
`theme-contrast-audit.md` | Measured contrast per theme |
`27-07-2026-moonlit-shrine-grafisk-profil.html` | Visual reference: brand, colour, type, icons, components |
`27-07-2026-moonlit-shrine-profil-1.1.html` | Live reference: press and hold, text controls, theme gallery |
`27-07-2026-moonlit-shrine-remaining-surfaces.html` | Visual reference: the 13 surfaces above, with final English copy |
`27-07-2026-moonlit-shrine-v0.5.1-typografi.html` | Working prototype: library, hero, detail, schedule, stats |
`HANDOVER.md` | Build plan, phases, acceptance criteria |

Where a document and a prototype disagree, this document wins. Where this document is silent, ask before inventing.
