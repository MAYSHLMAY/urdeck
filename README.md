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
