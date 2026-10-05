# Moonlit Shrine – profil 1.1

Tillägg till grafisk profil 1.0 · 27/07/2026

Tre tillägg: tryck- och hållanimationer, användarstyrd textstorlek och tjocklek, samt 41 teman. Alla tre är byggda så att ingen komponent behöver skrivas om. Identiskt innehåll med `27-07-2026-moonlit-shrine-profil-1.1.html`.

---

## A · Håll och tryck

Profil 1.0 hade bara hover. Här är hela kedjan: hover, tryck ner, släpp, långtryck och drag. Regeln är att tryck ger en fysisk reaktion, aldrig en färgblink. Ytan krymper som om den ger efter, släppet fjädrar tillbaka.

### Nya tokens

```css
--e-press: cubic-bezier(.3,0,.6,1);
--d-press: 90ms;
--press-btn: .97;   /* knappar */
--press-icon: .90;  /* ikonknappar */
--press-card: .995; /* seriekort */
--press-chip: .95;  /* chips */
```

### Specifikation

| Element | Hover | Tryck ner | Släpp | Hålls |
|---|---|---|---|---|
| Primärknapp | lyft 1 px, ljus +8 % | `scale .97` · 90 ms | 200 ms `--e-out` | ring från pekaren, 520 ms |
| Ghost och quiet | kantlinje accent, mjuk yta | `scale .97` · 90 ms | 200 ms | ring i accentfärg |
| Ikonknapp | accentfärg och ring | `scale .90` · 90 ms | 200 ms | — |
| Chip | ljusare kant | `scale .95` · 90 ms | 200 ms | — |
| Switch | — | knoppen breddas till 22 px | 280 ms `--e-spring` | — |
| Flik | text ljusare | `translateY 1px` | understreck glider 240 ms | — |
| Seriekort | lyft 5 px, linje, färg, plus in | `scale .995`, lyft 2 px | 380 ms | **500 ms → markeringsläge** |
| Plusknapp på kort | fyllning accent | `scale .88` | progress växer, ring vid pekaren | — |
| Drag | cursor grab | lyft 8 px, luta 2,5°, full skugga | 280 ms `--e-out` | — |

### Detaljer som spelar roll

- **Ringen startar där du tryckte**, inte i mitten av knappen. Pekarens koordinater översätts till elementets lokala koordinater vid `pointerdown`.
- **Långtryck på kort i 500 ms** fyller en ring i mitten och går sedan in i markeringsläge. Det löser massmarkeringen som saknades i 1.0 utan en kryssruta på varje kort.
- **Flikarnas understreck är ett enda element** som flyttas, inte två färgbyten. Det gör bytet till en rörelse.
- **Drag används bara för att ordna om egna listor**, aldrig för att ändra status. Statusändring sker med knapp eller dialog.

### Pekskärm och tillgänglighet

Under `@media (hover:none)` tas alla hover-lägen bort och tryckskalorna förstärks ett steg, eftersom fingret döljer det som händer. Långtryck blir primärvägen till markeringsläge.

Under `prefers-reduced-motion` ersätts varje tryckanimation av ett opacitetsbyte på 120 ms, och långtrycksringen visas som en enkel fyllning utan animation.

---

## B · Textstorlek och tjocklek

Profil 1.0 hade fasta pixelvärden i typtokens, vilket inte går att skala. Skalan är omgjord: varje storlek är `calc(bas * var(--text-scale))` och varje vikt går via fyra viktvariabler. Två attribut på `<html>` styr allt.

### Nya tokens

```css
:root{
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
}
```

### Storlekar

| Läge | Etikett | `--text-scale` |
|---|---|---|
| `xs` | Kompakt | 0,92 |
| `s` | Standard | 1 |
| `m` | Bekväm | 1,08 |
| `l` | Stor | 1,18 |
| `xl` | Störst | 1,32 |

### Tjocklekar

| Läge | Etikett | body | med | strong | display |
|---|---|---|---|---|---|
| `light` | Lätt | 400 | 400 | 500 | 400 |
| `normal` | Standard | 400 | 500 | 600 | 600 |
| `clear` | Tydlig | 500 | 600 | 600 | 600 |
| `bold` | Fet | 500 | 600 | 700 | 700 |

Mincho har 400, 600 och 700, grotesk 400 till 700. Vikterna flyttas i par så rubrik och gränssnitt aldrig hamnar på samma tyngd.

### Layout som följer med

Kortens omslagshöjd och plusknappens läge räknas på samma variabel: `height: calc(126px * var(--text-scale))`. Kolumnerna faller automatiskt:

| Textstorlek | Kolumner vid 1440 px |
|---|---|
| Kompakt till Bekväm | 6 |
| Stor | 5 |
| Störst | 4 |

### Vad som går sönder utan omsorg

- **Flikraden är trängst.** Vid 132 % ryms inte sju flikar på 1280 px. Raden måste kunna skrolla vågrätt, eller Upptäck och Statistik flyttas in i en meny.
- **Korttitlar** bör gå från en till två rader ovanför 118 % i stället för att kapas.
- **Inställningen bor** i `data-text-size` och `data-text-weight` på `<html>`, sparade i localStorage och satta synkront i `<head>` precis som temat redan görs, så inget hoppar vid start.

---

## C · 41 teman

Appens fyrtio temanycklar finns kvar, så sparade inställningar fortsätter fungera, men alla värden är omräknade till den nya profilen: samma ytstege, samma linjer, samma textkontraster, bara olika ljus. Plus `moonlit-shrine` som ny standard.

### Motorn

Per tema anges bara fyra parametrar: **grundton** (nyans och mättnad för mörkret), **accent**, **ljuskälla** och **dekorfärg**. Ur det räknas nitton tokens fram med fasta ljushetssteg som är identiska i alla teman.

| Token | Regel |
|---|---|
| `--bg` → `--line-lit` | L = 5 · 9 · 10,5 · 13,5 · 17 · 27 % |
| `--text` / `--dim` / `--faint` | L = 92 / 70 / 55 %, mättnad 10–12 % |
| `--accent-lit` | accenten ljusas upp i steg om 2 % till ≥ 4,6:1 mot bg |
| `--accent-soft` | accent vid 12 % opacitet |
| `--accent-deep` | accent med L × 0,55 |
| `--support` | grundton +18°, mättnad 26 %, L 62 % |
| `--positive` / `--warning` | fasta: 142° och 38° |

Ljusa teman inverterar ljushetsstegen (L = 96 · 99 · 100 · 97 · 89 · 74) och mörknar accenten i stället för att ljusa den.

### Kontroll av kontrast

Kontrasten kontrolleras i motorn, inte i efterhand. Inget tema släpps med accenttext under 4,6:1. Accent som ren fyllnadsfärg ligger i flera teman under 4,5:1, vilket är skälet till att accentfyllnad aldrig bär text utan alltid är bakgrund till vit text i vikt 500.

### Teman per familj

| Familj | Teman |
|---|---|
| **Ask och crimson** | moonlit-shrine (standard), crow-feather, crimson-core, blood-moon, eclipse, rogue |
| **Sakura** | bloom, nightshade, mystic, phantom, venom |
| **Lykta** | solar, sunflare, copper, radiant *(ljust)*, parchment *(ljust)* |
| **Jade** | verdant, jade, viridian, moss-shrine, cedar |
| **Frost** | frost, glacial-rift, holo-deck, tidal, deep-sea, clean-interface *(ljust)* |
| **Iris** | amethyst, arcane-ward, nebula, indigo-night, celestial, wisteria |
| **Ember** | ember, inferno, wildfire, aurora |
| **Void** | void, obsidian, storm, static, wraith, ashen, cobalt, daybreak *(ljust)* |

Fyra teman är ljusa: radiant, parchment, clean-interface och daybreak. Det var det som saknades i profil 1.0. Räkna med att omslagsbehandlingen behöver ett eget värde i ljust läge, ungefär `brightness(.96) saturate(.8)`, eftersom mörkning mot vitt beter sig annorlunda än mot svart.

### Exempel på temadefinition

```js
const themes = [
  { key:"moonlit-shrine", name:"Moonlit Shrine", fam:"ask",
    base:[222,18], accent:[356,64,54], glow:[214,42,78], deco:[4,48,54] },
  { key:"crow-feather",  name:"Crow Feather",  fam:"ask",
    base:[228,14], accent:[348,55,50], glow:[220,30,74], deco:[352,40,48] },
  // … 41 rader totalt
];
// surfaces(base) → 6 ytor
// texts(base)    → 3 textnivåer
// accents(accent, bg) → 4 accenttokens, med ensureContrast(col, bg, 4.6)
```

### Rekommendation för bygget

Kör generatorn en gång och klistra in resultatet som fyrtioen `[data-color-theme]`-block i `styles.css`. Då behåller appen sin nuvarande struktur, inget beror på JavaScript vid start, och temaväljaren fungerar precis som i dag. Behåll generatorn i `scripts/` så att ett nytt tema är fyra tal i stället för nitton hexvärden.

---

## Konsekvenser för profil 1.0

| Avsnitt i 1.0 | Ändring |
|---|---|
| 04 Typografi | Typtokens är nu `calc()`-baserade. Fasta px-värden är borta. |
| 08 Komponenter | Varje komponent har fått definierat `:active`-läge och där det är relevant långtryck. |
| 10 Rörelse | Två nya tokens: `--e-press` och `--d-press`. Nya rader i koreografitabellen för tryck, långtryck och drag. |
| 14 Tokens som kod | Accentfärgerna heter nu `--accent`, `--accent-lit`, `--accent-soft` och `--accent-deep` i stället för `--crimson*`, eftersom de byter färg med temat. Crimson är standardvärdet, inte namnet. |
| 15 Överlämning | Massmarkering är löst via långtryck. Ljust läge finns via fyra teman. Kvar: Upptäck, import, skärmdumpsflödet. |

**Namnbytet är viktigt vid överlämningen.** Med 41 teman kan tokens inte heta `--crimson`. Alla komponenter refererar `--accent*`, och `moonlit-shrine` sätter dem till crimson.
