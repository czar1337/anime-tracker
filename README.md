# Anime Tracker

En lokal anime-tracker som körs på din egen dator. Ingen molntjänst, inget konto, ingen internetanslutning krävs (förutom för sökning mot AniList och Upptäck-fliken).

## Installera

**Enklast — den fristående `.exe`-filen (Windows, kräver inget extra):**

1. Ladda ner `AnimeTracker.exe`.
2. Dubbelklicka på den. Ett litet konsolfönster öppnas och webbläsaren startar automatiskt.

Det är allt — ingen installation, inget Node.js krävs.

**Alternativet — zip med `start.bat`/`start.sh` (kräver Node.js):**

1. Ladda ner och packa upp zip-filen någonstans på din dator.
2. Windows: dubbelklicka på `start.bat`. Mac/Linux: kör `./start.sh` i en terminal.
3. Om Node.js inte är installerat visas ett meddelande med en länk till nodejs.org — installera det och kör filen igen.
4. Webbläsaren öppnas automatiskt på `http://localhost:4321`.

## Uppdatera

Radera hela den gamla programmappen (eller den gamla `.exe`-filen) och packa upp/lägg dit den nya versionen. **Din data ligger på en annan plats och påverkas inte** — se nedan.

Appen visar en diskret notis högst upp om det finns en nyare version tillgänglig, med en länk till GitHub-releasen. Appen laddar aldrig ner eller installerar något åt dig — det är alltid ett manuellt steg.

## Var din data bor

All data (ditt bibliotek, omslagsbilder, automatiska backuper, förslag från Upptäck-fliken) ligger **utanför** programmappen, i en OS-specifik mapp:

- **Windows:** `%APPDATA%\anime-tracker\`
- **macOS:** `~/Library/Application Support/anime-tracker/`
- **Linux:** `~/.local/share/anime-tracker/` (eller `$XDG_DATA_HOME/anime-tracker/` om den miljövariabeln är satt)

Det betyder att du alltid kan radera hela programmappen och lägga dit en ny version utan att förlora något.

Om du uppdaterar från en version äldre än denna flyttas din gamla data automatiskt **en gång**, första gången du startar den nya versionen. Den gamla mappen rörs aldrig eller raderas — du hittar en `MOVED.txt`-fil där som förklarar var datan tog vägen, ifall du vill dubbelkolla eller städa bort den manuellt själv senare.

## Manuell backup

Appen tar automatiskt en backup vid varje sparning (de senaste 30 sparas i `backups/`-mappen inuti datamappen ovan). Vill du ta en egen backup:

1. Gå till datamappen för din plattform (se ovan).
2. Kopiera hela mappen någonstans säkert (t.ex. en extern disk eller molnlagring).

Det räcker för att återställa allt — biblioteket, omslagsbilder och inställningar.

Du kan också exportera en enskild JSON-fil med hela biblioteket via knappen "Backup & restore" i appens header.
