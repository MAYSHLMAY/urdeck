# Flight Recall (Next.js + Supabase)

Spaced-repetition flashcards with a 3D lab. Same features as the single-HTML version, rebuilt so it can grow:

- **Next.js 14 (React, TypeScript)**: the app, plus Node API routes for owner-only writes.
- **Supabase (Postgres)**: cards, folders, titles, packs. The old JSON files are imported into real tables.
- **Fast and offline-friendly**: cards are cached in IndexedDB and only *new* cards are downloaded; a service worker caches the app.
- **Your progress** (answers, streaks, notes, settings) stays on the device, as before, with backup/restore in Settings.

## 1. Set up Supabase (5 minutes)
1. Create a project at supabase.com.
2. Open **SQL Editor**, paste `supabase/schema.sql`, run it.
3. Project Settings -> API: copy the project URL, `anon` key and `service_role` key.

## 2. Configure
```bash
cp .env.example .env.local      # fill in the 5 values
npm install
```
`OWNER_PASSWORD` unlocks the **+** button (add folders and cards). `SUPABASE_SERVICE_ROLE_KEY` is only used on the server. Never put it in the browser.

## 3. Import your existing JSON
Put your old `data/` files in a folder (`cards.json`, `index.json`, `folders.json`, `added.json`, `packs/*.json`), then:
```bash
npm run import:dry -- ./data     # check the counts first
npm run import -- ./data         # write to Supabase (safe to re-run)
```
Card ids are unchanged, so existing progress keeps working.

## 3b. Reference PDFs (pools, viewer, notes)
1. In the SQL Editor also run `supabase/pdf-reference.sql` (tables + a public read-only `pdfs` storage bucket).
2. Optional: set `NEXT_PUBLIC_ALLOW_PUBLIC_PDF_UPLOADS=true` if every user should be able to upload PDFs. Default is owner-only.

How it works (tap **Open Reference PDF** under any quiz card, or press **R**):
- **Pools**: categories drawn as water pools (more PDFs = fuller pool). One category can hold many PDFs and one PDF can be in many categories (the 🗂 button). A pool with several PDFs shows a chooser; it can remember your pick.
- **Auto-match**: the owner selects a passage in the PDF and taps **Map this question here**. From then on that question opens at that page with the passage highlighted. Without a mapping, the pool linked to the card's set opens instead (tick *Use this pool for the current card set*).
- **Drawer**: side panel on wide screens, bottom sheet on phones. The quiz state lives outside it, so toggling never resets the card, and the PDF keeps its scroll position.
- **Notes**: select text, tap **Save note**. Saved instantly in the browser (IndexedDB), shown as yellow highlights, and backed up to Supabase in the background (toggle in the Notes tab; retries when offline).

## 4. 3D models, categories and the Home page
1. In the SQL Editor also run `supabase/models.sql` (tables `models` and `model_categories`).
2. Copy your built-in model files into `public/models/` (`elevon.model.js`, `ruddervator.model.js`; the ones shipped are placeholders).
3. **Only the owner can upload, recategorise or delete models** (their code runs in every visitor's browser). Unlock in Settings → Owner, open the 3D lab, tap **Upload .js**, pick the file, then choose which category (pool) it belongs to. The category of any model, built-in or uploaded, can be changed later in the lab's Info tab.
4. The **Home page** (`/`) shows every category with its card sets, PDFs and 3D models. The study screen is at `/study`.

## 4b. Password-protected deletes
Deleting a folder, a pool (category), a PDF or a 3D model always asks for the owner password again (on top of being unlocked). The password is checked on the server; 8 wrong tries in 15 minutes are blocked. Nothing is deleted without it.

## 4c. PDF reader upgrades, notes and card editing (run these two SQL files too)
- `supabase/notes-v2.sql`: lets note colours, tags and pins back up to the cloud (notes work on the device without it).
- `supabase/cards-edit.sql`: needed for the owner's **Edit card / Delete card / Add a card** (card menu **⋯** on the study screen; owner only, delete asks for the password).
- **Auto-find:** when a card belongs to a card set linked to a pool with PDFs, the app indexes those PDFs in the background (once per device) and the Reference button shows `✨ p. N`. One tap opens the PDF at that page with the passage highlighted. Cards with no linked PDF are skipped. Scanned (image-only) PDFs have no text to search.
- **Viewer:** zoom buttons, pinch zoom, ctrl+wheel, fit width, page jump, search inside the PDF, night mode, full-screen toggle.
- **Notes:** select text, then **Highlight** or **＋ Note** in the bar at the bottom (5 colours). The 🖍 marker saves anything you select automatically. Tap a highlight to edit it. The Notes tab has search, filters, tags, pins, page notes and export.

## 4d. Reader, practice and fonts
- **Reader:** drag the grip on its left edge (or the top handle on a phone) to resize it; the cards re-flow beside it and never sit under it. Double-click the grip to reset. The expand button (or `F`) makes it fill the whole page; `Esc` steps back.
- **Commands:** select text, then `H` highlights and `N` writes a note (`Ctrl+Enter` saves). `Ctrl +`, `Ctrl -`, `Ctrl 0` zoom; `Ctrl F` searches the PDF. Note tools live in a rail under the pages, so they never cover the text.
- **Check again:** on the finished screen it shows a warning and lets people bring back all cards, weak cards, unstudied cards or marked cards once each, as extra practice. Their schedule and progress are never changed.
- **No database content is ever deleted by an update.** The SQL files only add tables, columns and functions (`if not exists`). Editing a card keeps its id; deleting a card keeps a hidden tombstone row.
- **Fonts:** Inter (text), Manrope (headings) and Source Serif 4 (questions) load from Google Fonts, with system fallbacks. Icons are built-in SVG.

## 4e. Private space, Browse and Study / Shaky piles (no SQL needed)

**Private space (everyone who is not the owner).** The **+** button is open to everyone. Cards, folders, edits and removals made by a non-owner are saved **only on that device** (localStorage) and are never sent to Supabase. Any card can be edited or removed *for me only*: the shared card is untouched, a private copy is layered on top, and **Settings > Your private space > Restore originals** undoes it. Personal cards can be deleted for good. The owner's tools still save for everyone.

**My PDFs (on the device).** In the reader, **Pools > My PDFs** stores a PDF in the browser's IndexedDB (it handles large files, unlike localStorage; works on phone and PC). Nothing is uploaded, notes on it stay local too, and auto-find / highlight / zoom / search all work on it. The app asks the browser to keep the storage persistent. Backups (Settings > Download backup) include personal cards and piles, not the PDF files themselves.

**Browse.** The grid button next to **+** shows many cards at once: questions only, with answers, or with choices; Few / More / Most per screen; tap a card to reveal; "Reveal all" for rushing. **Study** and **Shaky** are two separate piles: tapping **Unsure** moves a card out of Study into Shaky (and **Got it** moves it back). Each set shows its own counts, and each pile (or single set) can be practised in one tap. Practice never changes your schedule.

**Smoother PDF text selection.** The reader now uses the same technique as browser PDF readers (an invisible end-of-content block behind the text), so dragging through gaps or past the last line no longer jumps the selection to far-away text. Selection is a soft blue tint, double-click selects a word and triple-click selects just the line.

**Mistakes list and Speed round.** Every wrong answer or "I don't know" (in normal study, practice and speed rounds) is logged on the device. Browse has a third tab, **Mistakes**, per set; a card leaves it after two right answers in a row (or tap Clear). **Speed round** (Browse footer) runs the cards of the open tab against a 1 / 2 / 5 / 10 minute clock, auto-advances after each answer, never reschedules anything, then shows answered / right / accuracy and offers to drill the ones you missed.

**Reader: floating selection menu, dictionary, auto-find switch.**
- *Selection menu* (like WPS / Edge): colour dots plus Highlight, Underline, Strike, Note, Copy, Define, Find. On phones it opens by itself once the selection settles (below the handles); on a computer, right-click a word or a selection. Underline and strike-through are saved as notes with a style. Selection boxes are now merged into one clean box per line (no more doubled, darker patches), and the selection stays steady while dragging the phone handles.
- *Dictionary* (book button in the PDF toolbar, or Define in the menu): online, uses the free dictionaryapi.dev (Wiktionary data). The meaning that best fits the surrounding words is shown first (a local word-overlap and part-of-speech check, no AI); other meanings are one tap away. Only the single word is sent.
- *Auto-find switch* (sparkle button in the PDF toolbar, for everyone): turns the background matching and automatic jump to the passage on or off per device. When off, "Find passage" does it once on demand.

## 5. Run / deploy
```bash
npm run dev        # http://localhost:3000
npm run build && npm start
```
Deploy on Vercel: import the repo, add the same env vars. No other server is needed. The Node API is the `src/app/api/*` routes.

## How it is organised
| Path | What |
|---|---|
| `supabase/schema.sql` | tables + read-only public access (RLS) |
| `scripts/import.ts` | JSON -> Supabase importer |
| `src/lib/engine.ts` | the study engine (scheduler, queues, undo, backup) |
| `src/lib/srs.ts`, `tree.ts`, `parse.ts` | spaced repetition maths, folder tree, card text parser |
| `src/lib/library.ts` | Supabase reads with IndexedDB delta sync |
| `src/app/api/*` | owner login, add cards, folder changes, export, PDFs, pools/links/mappings, notes backup |
| `src/lib/refs.ts`, `notes.ts` | reference-PDF store and local-first notes store |
| `src/components/ReferenceDrawer.tsx`, `CategoryPool.tsx`, `PdfViewer.tsx`, `refHooks.ts` | drawer, pool selector and link manager, lazy PDF viewer, note-capture hook |
| `src/components/*` | React screens |

## Security notes
- Everyone can read the library; only the API (service key) can write, after an owner login. Tokens are signed and last 30 days.
- Change `OWNER_PASSWORD` and `AUTH_SECRET` before going public.

## 4f. PDF selection and dictionary fixes
Selection no longer spills into neighbouring text, right-click inside a selection keeps it, and the dictionary races two sources with a 20 s patience, a "Try again" button and an offline cache of words already looked up.

## 5. Live quiz (Kahoot-style)
- **Setup:** run `supabase/games.sql` once (adds `game_sessions` and `game_players`; nothing existing is touched). In Supabase, Realtime must be enabled (broadcast and presence on public channels; topics start with `fr-`).
- **Host:** the owner opens `/host` (Home → "Host a quiz"), picks sets, sets questions / seconds / points mode (standard, double, none) / streak bonus / teams (2–4) / shuffle / late joiners / auto-advance / sound, and gets a PIN, link and QR code. The host's browser runs the game (no server, no database while playing). Refreshing the host page resumes the game.
- **Players:** anyone opens `/play`, creates a player once (random or typed nickname, stick-figure builder or free DiceBear avatars). The identity is stored in localStorage, IndexedDB and a cookie, repaired from whichever survives, with persistent storage requested and a recovery code for moving devices. Players can enter a PIN, tap an open game, or scan the QR code.
- **Game:** coloured-shape answer buttons, faster answers score more (500–1000), streak bonus, live answer counts, histogram, top-5 board between questions, podium with confetti, pause / +10 s / skip / end, kick, lock, CSV download, play again.
- **Database:** only the finished results (scores, ranks, accuracy, streaks) are written, by the owner's browser, to feed the all-time and recent-games leaderboards at `/play`.
- Testing without Supabase: add `?t=local` to every tab URL to run over a same-browser channel.

## 6. Device sync (no accounts)
- Run `supabase/sync.sql` once (adds `sync_ops` and the `sync_put` function; nothing existing is touched).
- Settings → **Sync your devices** → "Start syncing on this device" gives a 20-character code (also a QR code and link). Enter it on another device (or open the link) to join the same private space.
- What syncs: card progress, shaky and mistake piles, your own cards and edits, folders, notes on shared PDFs, daily history. What does not: PDF files added on a device, display settings, the live-quiz player.
- How it stays collision-free: every record has its own hybrid logical clock stamp; when two devices change the same record the newer stamp wins on both, deletes are stamped tombstones, and records changed on only one device always arrive. The server keeps only the newest version of each record.
- Privacy: everything is encrypted in the browser (AES-GCM) with a key made from the code; the server only sees opaque blobs under a hash of the code. Anyone who has the code can read and change that space, so keep it to your own devices.

## 7. Design
`app/theme.css` holds the shared design layer (fonts incl. Noto Sans/Serif Ethiopic for Ge'ez text, baseline form controls, top bar, home page, footer, tibeb band). `app/game.css` styles the live quiz using the same colour variables, so light and dark follow the site.


Note (design): there is no footer. On phones a fixed bottom tab bar (Home, Study, Quiz, 3D lab) gives an app feel; wider screens use the top bar.

## 8. Look, app feel and quiz characters
- Settings → Look has an accent colour picker (8 palettes) plus light/dark. It is stored on the device and applied before first paint on every page (`src/lib/look.ts`, `src/app/app.css`). Font: Plus Jakarta Sans with Noto Sans Ethiopic fallback.
- Phones get a floating bottom tab bar, bottom-sheet dialogs and an app-style home (`Today` card, quick actions, swipeable topics).
- PDF reader has a visible, draggable scroll handle in addition to the scrollbar.
- Live quiz: face characters (`components/game/Avatar.tsx`) with moods; the player's character sits at the bottom of the screen and gets happy or angry after each answer. Older stick-figure codes still load as characters.

## 9. Pictures, import/export, goals, exam, reminders
- **Card pictures:** in the card editor, "Picture" adds a diagram; tap it to drop numbered pins and name them. Learners tap a pin to reveal its name; after answering all names show. Stored inside the question text as `<!--img:SRC|name@x,y-->` (no database change). Owner uploads go to a public Storage bucket `card-images` (created automatically by `/api/cardimg` with the service key); private cards keep a small shrunken copy on the device.
- **Import/export:** Add (+) → Import / export. CSV columns: set, question, correct, wrong1..wrong5, image, pins. Anki text and two-column Quizlet-style files also import (wrong choices are borrowed from other cards). Export as CSV or Anki text.
- **Goals:** daily goal (Settings → Studying), streak freezes (one earned per 7-day streak, max 2, used automatically to cover missed days), 10 badges, and a "Needs work" list of weak topics on Home.
- **Mock exam:** `/exam` timed mixed test, no feedback until submit, score by topic, wrong answers can go to Shaky; wrong answers feed the Mistakes list.
- **Quiz power-ups:** 50/50 and ×2 points, once each per player (host switch "Power-ups").
- **Study feel:** swipe right/left on the card, optional answer sounds, vibration, offline pill.
- **Reminders:** Settings → Studying → Daily reminder. Best effort without a push server (scheduled notification, periodic sync for installed apps, timer while open). Guaranteed delivery needs Web Push (VAPID keys + a scheduled job).


## 10. Simulations, Anki-style cards, image occlusion

**Lab simulations (any Three.js / 2D / HTML).** Besides the built-in model format, the owner can upload (or paste) a full HTML page or a bare three.js script
(first line `/* flight-recall-sim */`, or `/* flight-recall-sim: My title */`). It runs in a sandboxed iframe with its own buttons and UI; three r128, OrbitControls
and `import ... from 'three'` are provided from `public/vendor/three`. The viewer has Fill (the sim fills the space) and 16:9 / 4:3 / 1:1 / 9:16 (fixed design size,
scaled proportionally), restart and full screen. No SQL change: sims are stored in the same `models` table.

**Card kinds.** Add card -> pick Multiple choice, Flip, Reversed (two cards), Type answer, Cloze (`{{c1::word}}`, one card per number) or Image occlusion.
Study shows them the Anki way (Show answer, then Again / Hard / Good / Easy, keys 1-4) with the same scheduling. They are stored as ordinary cards
(a `<!--k:x-->` token in the question, wrong choices borrowed from the set), so the live quiz, mock exam, speed rounds, browse, search and device sync need nothing new.

**Image occlusion.** Add a picture, drag boxes over the parts, name each one; one card per box, "Hide one" or "Hide all". The boxes are also drawn in the live quiz.

### Cards file (.txt)
Add → Import / export accepts one text file with every card kind (see `example-cards.txt`): `F:` flip, `R:` reversed, `T:` type-in, `C:` cloze, `O:` image occlusion
(`O: image-url | hide-one|hide-all | Label@x,y,w,h | …`), `Q:` multiple choice, and `#Set name` lines. "Download cards file" exports your whole library in the same format.
Two-column Anki/Quizlet files now import as flip cards by default (cloze `{{c1::…}}` rows become cloze cards).

Simulations can also be dropped into Add → Import / export (.html, or .js starting with /* flight-recall-sim */); for the owner they are uploaded to the 3D lab.

### Manage cards (batch operations)
Add (+) or Browse → **Manage cards**: filter by set / type / text / past-exam, tick many cards (or "select all shown"), then **Move** to another set (owner),
**Find & replace** (questions, answers or both; picture and mask data are never touched), **Mark / unmark past exam**, or **Delete** (owner password once for the whole batch).
The **Batch add** tab takes pasted lines: spreadsheet columns (front TAB back), `F:`/`R:`/`T:`/`C:` lines, or `question | right | wrong | wrong | wrong`.
Owner changes are saved for everyone through `POST /api/cards {action:'batch'}` (no new SQL; it reuses `edit_card`). Everyone else's batch edits are private to the device.
