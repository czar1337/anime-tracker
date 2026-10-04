# Moonlit Shrine – grafisk profil 1.0

Anime Tracker · 27/07/2026 · dark mode först · offline med lokala typsnitt

En grafisk profil för Anime Tracker. Mörk, varm i botten och kall i ljuset, med crimson som enda starka färg och rörelse som andas snarare än pockar. Referenserna är en lyktgata i körsbärsblom och Itachi under röda löv: allvarlig, återhållsam, vacker utan att skrika.

Den här filen har identiskt innehåll med `27-07-2026-moonlit-shrine-grafisk-profil.html` och är avsedd som underlag för överlämning till bygget.

---

## 01 · Grundhållning

Fem principer som avgör varje senare beslut. När något känns fel i en skiss är det nästan alltid en av dessa som brutits.

1. **Mörkret är rummet, inte temat.** Bakgrunden är blåsvart och nästan tom. Allt som lyser gör det för att det betyder något: ett nytt avsnitt, en aktiv flik, en progress som rör sig. Dekoration lyser aldrig starkare än information.
2. **Crimson är sällsynt.** Högst tre crimson-ytor per skärm. Färgen betyder handling eller händelse. När allt är rött betyder inget något, och allvaret blir aggression.
3. **Omslagen är dämpade i vila.** AniLists omslag är brokiga. I vila sänks mättnad och ljus så rutnätet läser som en helhet. Hover ger full färg, vilket gör uppmärksamhet till en handling istället för ett brus.
4. **Rörelsen andas.** Ambient rörelse är långsam, gles och genomskinlig. Belöningar är korta och ligger där handlingen skedde. Ingen blixt, ingen skärmskakning, inget som kräver att du väntar.
5. **Typografin bär allvaret.** Mincho i stora rubriker ger tyngd, grotesk i allt smått ger skärpa. Hierarki byggs med storlek, färg och luft, inte med fler typsnitt eller fler färger. Om en skärm känns platt är det luft som saknas, inte effekter.

---

## 02 · Märke och logotyp

Märket är en avtagande måne med en fjäder som faller genom den. Månen ger natten och stillheten, fjädern ger Itachi-referensen och kopplar ihop med appens belöningsanimation. Crimson finns bara som en tunn linje i fjäderns skaft, vilket gör märket läsbart även i 16 px.

**Varianter:** app-ikon (rundad kvadrat, måne + fjäder + tunn ram), horisontell lockup (märke + ordmärke), vertikal lockup, samt en variant för ljus yta där månen blir `#3D4654` och punkten `#B32F38`.

| Användning | Storlek | Detalj |
|---|---|---|
| App-ikon | 256 / 128 / 64 px | måne + fjäder + ram |
| Header i appen | 19 px text, 7 px märke | crimson punkt räcker |
| Favicon | 32 / 16 px | bara måne + punkt, ingen fjäder |
| Minsta bredd lockup | 96 px | under det: bara märket |

**Frizon:** minst en månradie luft runt hela lockupen. Ingenting placeras i frizonen, inte heller dekorativa löv.

**Så här inte:** lutas eller sträcks, läggs på crimson, byter typsnitt, får glöd eller skugga.

---

## 03 · Färg

Paletten har en kall blåsvart botten, ett varmt rött ljus och tre stödfärger med tydliga jobb. Varje färg har en roll, och roller överlappar inte. Kontrastvärden är uppmätta mot bakgrunden `#0C0E13`.

### Ytor, mörkt till ljust

| Token | Hex |
|---|---|
| `--bg-deep` | `#080A0E` |
| `--bg` | `#0C0E13` |
| `--bg-elevated` | `#12161E` |
| `--card` | `#141821` |
| `--card-hover` | `#181D27` |
| `--line` | `#212734` |
| `--line-lit` | `#38424F` |

### Färger med roll

| Färg | Hex | Kontrast | Roll |
|---|---|---|---|
| Crimson | `#D43F4A` | 4,25:1 | Fyllnad och indikator. Primärknapp, aktiv flik, progress, ny-punkt. Aldrig som textfärg. |
| Crimson ljus | `#EA6B70` | 6,30:1 | All crimson text och alla crimson-ikoner. Länkfärg i detaljvyn. |
| Crimson djup | `#8F2730` | — | Enbart släppta serier och nedtonad progress. Aldrig text. |
| Måne | `#B0C4DE` | 10,2:1 | Ljuskälla i atmosfären. Aldrig på ytor eller text, bara glöd med låg opacitet. |
| Stål | `#8098B5` | 6,53:1 | Neutral interaktion. Sekundära etiketter, hero i lugnt läge. |
| Salvia | `#8FA88F` | 7,53:1 | Positiv status: sparat, avklarad, sänds nu. |
| Amber | `#C9A05B` | 8,17:1 | Varning som inte är fel: gammal backup, saknad data, importkonflikt. |
| Löv | `#C2564F` | — | Bara atmosfär: löv, blomkrona. Aldrig gränssnitt. |

### Text

| Token | Hex | Kontrast | Används för |
|---|---|---|---|
| `--text` | `#ECE8E3` | 16,0:1 | Titlar, primär text, siffror som räknas |
| `--dim` | `#A2AAB7` | 8,3:1 | Sekundär text, metadata, löptext |
| `--faint` | `#7B8494` | 5,1:1 | Etiketter, flikar i vila, hjälptext |
| `--faint-deco` | `#6A7280` | 4,0:1 | Endast avdelare och dekorativ text, aldrig information |

**Två regler som inte får glömmas.** Crimson `#D43F4A` klarar 4,25:1 och är därför förbjuden som textfärg; all crimson text använder `#EA6B70`. Vit text på crimson fyllnad ligger på 4,56:1, vilket precis håller, så knappar använder minst vikt 500 och aldrig mindre än 12 px.

### Fördelning på en skärm

Bakgrund och ytor cirka 72 %, linjer och text 18 %, stödfärger 7 %, crimson 3 %. Om crimson tar mer än ungefär tre procent har något gått fel. Mät genom att kisa: skärmen ska läsa som mörk med enstaka glöd.

---

## 04 · Typografi

Zen Old Mincho bär varumärket och stora rubriker. Schibsted Grotesk bär allt annat. Nio tokens, inga lösa värden. Mincho används aldrig under 17 px och aldrig i versaler, eftersom dess latinska versaler blir platta och seriferna slammar igen.

| Token | Specifikation | Används för |
|---|---|---|
| `--t-display-l` | Mincho 600 · 30/1.16 · +0,015em | Hero-titel, stora tal i statistik |
| `--t-display-m` | Mincho 600 · 21/1.24 · +0,015em | Detaljtitel, vyrubrik, tomt läge |
| `--t-display-s` | Mincho 600 · 19/1.2 · +0,055em | Varumärket, bara där |
| `--t-body` | Grotesk 400 · 13/1.62 | Anteckningar, löptext, notiser |
| `--t-action` | Grotesk 500 · 12,5 | Alla knappar |
| `--t-card` | Grotesk 500 · 12/1.3 | Korttitlar, klockslag |
| `--t-meta` | Grotesk 400 · 11/1.5 | Sekundär rad, chips, hjälptext |
| `--t-micro` | Grotesk 500 · 10,5 · +0,16em | Flikar och etiketter |
| `--t-nano` | Grotesk 500 · 9,5 · +0,22em | Kicker, minsta etiketter |

**Siffror:** allt numeriskt sätts med `font-variant-numeric: tabular-nums`. Avsnittsräknare, betyg och klockslag byter bredd annars när 9 blir 10.

**Kursiv:** Mincho kursiv används på exakt ett ställe, originaltiteln i detaljvyn.

**Filer att bundla:** `zen-old-mincho-600.woff2`, `zen-old-mincho-700.woff2`, `schibsted-grotesk-400/500/600.woff2`. Cirka 145 kB latinsk delmängd totalt. Sora och Inter kan tas bort.

---

## 05 · Rutnät och rytm

Allt avstånd är en multipel av 4, med 8 som grundsteg. Sidmarginalen i appen är 26 px, det enda undantaget, och finns för att kortrutnätet ska landa jämnt på 1440 px.

**Skala:** 4, 8, 12, 16, 24, 32, 48, 64. Fyra inuti komponenter, 8–16 mellan komponenter, 24–32 mellan grupper, 48–64 mellan sektioner.

| Bredd | Kolumner | Kortbredd |
|---|---|---|
| ≥ 1600 | 7 | ~198 px |
| 1280–1599 | 6 | ~192 px |
| 1024–1279 | 5 | ~184 px |
| 768–1023 | 4 | ~168 px |
| < 768 | 2 | flexibel, hero staplas |

**Radier:** 4 chips inuti kort, 7 knappar och fält, 11 kort, 12 paneler, 16 hero och dialoger, 999 taggar och notiser.

**Proportioner:** omslag i kort visas i 3:2 landskap som beskärning av AniLists porträttbild, 132 px höjd vid 192 px bredd. Miniatyrer i listor och schema är 3:4 porträtt, 32×44 px. Hero är 268 px hög oavsett bredd.

---

## 06 · Ytor och djup

Djup byggs med tre medel i ordningen yta, linje, skugga. Glöd är ett fjärde medel som bara får användas när något faktiskt är aktivt.

| Nivå | Yta | Linje | Skugga | Exempel |
|---|---|---|---|---|
| 0 · rummet | `--bg` | — | — | Appens bakgrund |
| 1 · kort | `--card` | `--line` | `--sh-1` | Serier i rutnätet, paneler |
| 2 · lyft | `--card-hover` | `--line-lit` | `--sh-3` + glöd | Kort under pekaren |
| 3 · överlägg | `--bg-elevated` | `--line-lit` | `--sh-2` | Detaljvy, dialoger, notiser |
| 4 · hero | omslag + gradient | crimson 28 % | glöd 48 px | Ett per skärm, aldrig fler |

**Oskärpa** används på exakt tre ställen: överläggets bakgrund, notisen och plusknappen på kort.

---

## 07 · Ikonografi

Ett streck, aldrig fyllning. 24 px rityta, 1,5 px streck, runda ändar och hörn, inga detaljer under 2 px. Ikoner är `--dim` i vila och `--text` eller `--crimson-lit` i hover, aldrig flerfärgade.

Setet omfattar: sök, lägg till, avisering, schema, statistik, import, export, filter, sortera, klar, stäng, betyg, märket (fjäder), historik, ta bort, inställningar.

---

## 08 · Komponenter

**Knappar, fyra nivåer.** Primär (crimson fyllnad, högst en per vy), ghost (linje + svag yta), quiet (bara linje), danger (crimson linje och ljus crimson text). Lägen: vila, hover, aktiv, avstängd, laddar. Fokus är alltid 2 px crimson ring med 2 px offset.

**Fält.** Linje `--line`, radie 7, hover ger `--line-lit`, fokus ger crimson linje och `--crimson-soft` yta. Genvägen visas som `kbd` till höger.

**Chips.** Piller, 11 px text. Vila neutral, valt läge crimson linje och mjuk yta. Aktiva filter får ett kryss.

**Taggar.** Nytt avsnitt (crimson fyllnad, vit text), Sänds nu (salvia linje), Avklarad (stål linje), Släppt (crimson linje).

**Flikar.** Versaler i `--t-micro`, aktiv flik får `--text` och crimson understreck, antal i tabulära siffror.

**Seriekort, fem tillstånd.** Normal, nytt avsnitt (crimson punkt uppe till vänster), avklarad (stålfärgad progress, 26/26), släppt (opacitet 0,55 och djup crimson progress), skelett vid inläsning. Hover: lyft 5 px, crimson hårlinje ritas över kortets överkant, omslaget får färg, plusknappen seglar in.

**Återkoppling.** Notis som piller nedtill med Ångra, tooltip i `--bg-elevated`, dialog för destruktiva handlingar som alltid berättar vad som bevaras, samt tomt läge med mincho-rubrik och två handlingar.

---

## 09 · Omslag och bild

Omslagen kommer utifrån och kan inte styras. Behandlingen är därför en del av profilen: den gör tolv olika bildvärldar till ett rutnät.

| Regel | Värde |
|---|---|
| Vila | `filter: saturate(.66) brightness(.9) contrast(1.05)` |
| Hover | `filter: saturate(.96) brightness(1) contrast(1.03)` · 420 ms |
| Övertoning över omslag | `linear-gradient(transparent 50%, rgba(20,24,33,.95))` |
| Hero-övertoning | `linear-gradient(100deg, rgba(12,14,19,.94) 24%, rgba(12,14,19,.68) 52%, rgba(12,14,19,.35))` |
| Saknat omslag | Mincho-initial i 22 % opacitet på plattyta, aldrig tom ruta eller generisk ikon |

**Profilens känsligaste punkt.** Behandlingen är avstämd mot gradienter i skisserna och måste provas mot ditt eget bibliotek innan bygget, särskilt mot ljusa och vita omslag där `brightness(.9)` kan behöva sänkas till `.82`.

---

## 10 · Rörelse

Tre kurvor, fem tider, en regel: rörelsen ska tala om vad som hände, inte om att appen kan animera.

- `--e-out` `cubic-bezier(.2,1,.3,1)` – standard: kortlyft, överlägg, progress
- `--e-spring` `cubic-bezier(.2,1.5,.3,1)` – endast plusknapp och belöningar
- `--e-inout` `cubic-bezier(.4,0,.2,1)` – färg- och opacitetsbyten, flikar
- Tider: 120, 200, 280, 380, 800 ms

| Händelse | Tid | Kurva | Vad som rör sig |
|---|---|---|---|
| Hover på kort | 380 ms | `--e-out` | Lyft 5 px, linje ritas, omslag får färg, plusknapp in |
| Fokusring | 120 ms | `--e-inout` | Ring tonar in, ingen förflyttning |
| Flikbyte | 200 ms | `--e-inout` | Färg och understreck, innehållet byts utan animation |
| +1 avsnitt | 280 ms + 1,1 s | `--e-spring` | Progress växer, crimson ring vid pekaren, notis in |
| Serie avklarad | 2,4 s | `--e-out` | Ring plus en fjäder som seglar nedåt från kortet |
| Överlägg öppnas | 340 ms | `--e-out` | Opacitet plus 14 px uppåt, skala 0,985 till 1 |
| Notis | 300 ms in, 4,2 s kvar | `--e-out` | Glider upp underifrån, försvinner själv |

**Förbjudet:** blixt, skärmskakning, glitch, parallax som följer musen, animerade siffror som räknar upp, allt över 2,5 sekunder, och rörelse som blockerar en klickyta.

---

## 11 · Atmosfär

Fyra lager bakifrån: månglöd, blomkrona, löv och fjädrar, kornighet och vinjett.

| Lager | Antal | Tid | Opacitet |
|---|---|---|---|
| Löv | 5 | 19–27 s | 0,26–0,40 |
| Fjäder, ambient | 1 var 42:a sekund | 26–36 s | 0,22–0,30 |
| Fjäder, belöning | 1 per avklarad serie | 2,4 s | 0,95 |
| Månglöd | 1 | statisk | 0,17 |
| Blomkrona | 4 fält | statisk, blur 24 | 0,19–0,30 |

**Tre nivåer:** `data-decor="on | half | off"`. Halv sänker opacitet till 45 %. Av tar bort löv, fjädrar och blomkrona men behåller månglöd och vinjett. `prefers-reduced-motion` tvingar av.

**Prestandabudget:** max sex animerade element samtidigt, alla på `transform` och `opacity`. Inga animerade `filter` eller `box-shadow` i loop.

---

## 12 · Språk och ton

Appen talar lugnt, kort och i sak. Den beskriver vad som hänt, aldrig hur duktig du är. Inga utropstecken, inga emoji, ingen uppmuntran.

| Situation | Så här | Inte så här |
|---|---|---|
| Avsnitt markerat | Frieren avsnitt 19 markerat sett | Snyggt jobbat! Ett avsnitt närmare! |
| Serie avklarad | Mushishi avklarad · flyttad till Sett | Grattis, du klarade hela serien! |
| Nytt avsnitt | Nytt avsnitt · för tre timmar sedan | Missa inte detta! |
| Tomt läge | Inget här ännu | Hoppsan, det ser tomt ut här! |
| Fel | Kunde inte nå AniList. Din lista är oförändrad. | Något gick fel :( |
| Destruktivt | Serien flyttas till Släppt. Dina sedda avsnitt sparas. | Är du säker? |

**Ett beslut kvar.** Appen är i dag på engelska (Watching, Add Anime), medan skisserna är på svenska. Profilen fungerar i båda, men valet måste göras innan bygget eftersom vissa etiketter är längre på svenska och flikraden ligger nära sin bredd. Förslag: engelska i appen, eftersom serietitlar och AniList-data är engelska och blandspråk läser sämre än ett konsekvent val.

---

## 13 · Tillgänglighet

- **Fokus:** 2 px crimson ring, 2 px offset, `:focus-visible`, aldrig borttagen utan ersättning. Klickytor minst 28×28 px, helst 32.
- **Kontrast:** text 16,0:1, sekundär 8,3:1, etiketter 5,1:1, vit på crimson 4,56:1. Crimson som textfärg är förbjuden.
- **Färg är aldrig enda bäraren:** nytt avsnitt har både punkt och text, avklarad har både stålfärgad progress och 26/26, släppt har både sänkt opacitet och tagg.

**Tangentbord:** `/` filterfält, `n` lägg till, `1–7` byt flik, `j/k` nästa och föregående kort, `space` markera sett, `enter` öppna, `esc` stäng, `?` genvägar.

---

## 14 · Tokens som kod

```css
/* moonlit-shrine.css · tema och skala */
[data-color-theme="moonlit-shrine"] {
  /* ytor */
  --bg:#0c0e13; --bg-deep:#080a0e; --bg-elevated:#12161e;
  --card:#141821; --card-hover:#181d27;
  --line:#212734; --line-lit:#38424f;
  /* text */
  --text:#ece8e3; --dim:#a2aab7; --faint:#7b8494; --faint-deco:#6a7280;
  /* accent och status */
  --crimson:#d43f4a; --crimson-lit:#ea6b70; --crimson-soft:rgba(212,63,74,.11); --crimson-deep:#8f2730;
  --moon:#b0c4de; --steel:#8098b5; --sage:#8fa88f; --amber:#c9a05b; --leaf:#c2564f;
  /* form */
  --radius-xs:4px; --radius-sm:7px; --radius:12px; --radius-lg:16px;
  --sh-1:0 2px 8px -2px rgba(0,0,0,.5);
  --sh-2:0 12px 28px -14px rgba(0,0,0,.8);
  --sh-3:0 22px 42px -22px rgba(0,0,0,.95);
  --sh-glow:0 0 30px -18px rgba(212,63,74,.5);
  /* typsnitt */
  --display:"Zen Old Mincho", Georgia, serif;
  --ui:"Schibsted Grotesk", system-ui, sans-serif;
  --t-display-l:600 30px/1.16 var(--display);
  --t-display-m:600 21px/1.24 var(--display);
  --t-display-s:600 19px/1.2 var(--display);
  --t-body:400 13px/1.62 var(--ui);
  --t-action:500 12.5px/1 var(--ui);
  --t-card:500 12px/1.3 var(--ui);
  --t-meta:400 11px/1.5 var(--ui);
  --t-micro:500 10.5px/1 var(--ui);
  --t-nano:500 9.5px/1 var(--ui);
  --tr-display:.015em; --tr-brand:.055em; --tr-micro:.16em; --tr-nano:.22em;
  /* rörelse */
  --e-out:cubic-bezier(.2,1,.3,1);
  --e-spring:cubic-bezier(.2,1.5,.3,1);
  --e-inout:cubic-bezier(.4,0,.2,1);
  --d-1:120ms; --d-2:200ms; --d-3:280ms; --d-4:380ms; --d-5:800ms;
  /* rytm */
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px;
  --sp-6:24px; --sp-8:32px; --sp-12:48px; --sp-16:64px;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

```css
/* public/fonts/zen-old-mincho.css · samma mönster som inter.css */
@font-face {
  font-family: "Zen Old Mincho";
  src: url("/fonts/zen-old-mincho-600.woff2") format("woff2");
  font-weight: 600; font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+2000-206F, U+2212; /* latinsk delmängd */
}
```

---

## 15 · Överlämning

### Klart att bygga

Tokens, palett och typografi. Header, flikar, filterrad. Hero i två lägen. Seriekort i fem tillstånd. Detaljvy. Schema och statistik. Notiser, dialoger, tomt läge. Atmosfär och rörelse.

### Inte designat än

| Vy | Kommentar |
|---|---|
| Upptäck | Informationstät, störst risk för profilen |
| Import från MyAnimeList | Flerstegsflöde med granskningstabell |
| Skärmdump till serie | OCR-resultat och rättning |
| Massmarkering | Kräver ett urvalsläge på kortet |
| Ljust läge | Finns inte, crimson behöver mörkare nyans |

### Föreslagen ordning för bygget

1. Typsnitt lokalt, tokens i `styles.css` som nytt `[data-color-theme]`. Ingen risk, går att slå av, allt annat vilar på detta.
2. Header, flikar, kort och hero. Nittio procent av tiden i appen ligger här.
3. Detaljvy, notiser, dialoger, tomt läge. Gör appen sammanhållen innan finlir.
4. Atmosfär, rörelse, dekornivåer. Sist, eftersom det är enda delen som kan tas bort utan att något går sönder.
5. Schema, statistik, sedan Upptäck och import. Upptäck bör designas mot verklig data först.

**Två saker att prova mot din egen data innan steg 2.** Omslagsbehandlingen mot ljusa omslag, där `brightness(.9)` kan behöva bli `.82`. Flikradens bredd på svenska, eftersom Väntar, Släppt och Statistik tillsammans ligger nära kanten på en 1280 px skärm.

---

## Referensfiler

| Fil | Innehåll |
|---|---|
| `27-07-2026-moonlit-shrine-grafisk-profil.html` | Denna profil, visuellt och interaktivt |
| `27-07-2026-moonlit-shrine-v0.5.1-typografi.html` | Fungerande prototyp med tokens och typografi |
| `27-07-2026-moonlit-shrine-typsnitt-omgang-2.html` | Typsnittsjämförelse och beslutsunderlag |
| `27-07-2026-crimson-dusk-varianter.html` | Vägen fram till riktningen |
| `27-07-2026-anime-tracker-dark-anime-directions.html` | Sex ursprungliga rörelseriktningar |
| `27-07-2026-anime-tracker-design-directions.html` | Åtta ursprungliga grafiska profiler |
