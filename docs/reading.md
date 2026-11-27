# Articles (Read area)

- **Where:** `/articles` (list), `/articles/open?slug=...` (a published article), `/articles/open?mine=...` (private, this device only). `/read` is still the PDF reader.
- **Published articles:** the owner picks an .html file on the Articles page (shown only when unlocked as owner). Everyone can then open it and use it. No login is needed to read. Stored in the `articles` table (run `supabase/articles.sql` once); read and written only through `/api/articles`.
- **Replacing:** publishing a file that is mostly the same as a published article (even with another file name) shows what changed and offers "Replace for everyone" (same address, version goes up) or "Publish as a new article instead".
- **Opening:** an article opens as a normal full page (no frame), so its tabs, buttons, saved settings and links to the app work. A small Back button is added. Because it is a normal page it has full access to the app on that device, so only the owner publishes, and private files should be ones the person trusts. The frame (`ArticleFrame`, sandboxed with a network-blocking policy) is still used for the "Preview new file" tab in the compare screen.
- **Offline:** a published article opens offline after the first time it was opened.
- **Not built yet (on purpose):** article spec/renderer, generation pipeline, flashcard linking, SEO pages for each article.

## Updating an article by uploading the file again (My articles)
- Choose "Add an article from a file". The page is compared with every article here (yours and the public ones) by its **content**, not its file name (`src/lib/articles/diff.ts`).
- If most of an existing article's text is still there (50% or more), you get a compare screen: added, changed and removed lines (with the exact words changed), filters, next/previous change, folded unchanged lines, a switch for changes inside simulations and code, and a preview of the new file.
- Then you choose: **Replace the old one** (kept as a previous version, last 3 kept, **Undo update** on the row), **Add as a new article**, or Cancel.
- An identical file is recognised and nothing is changed. "Update from file" on a row compares against that article only, even if little matches.
- A matching published article offers "Save as my own copy" to everyone; only the owner can replace it for everyone.

## Offline
- Published articles are saved on the device (IndexedDB `ud-articles-v1`, store `p`) in the background whenever the list loads online, and refreshed when a newer version exists. Opening one reads the saved copy first, so it works with no connection. Private articles are always on the device.
- Article links are plain links to `/articles/open?...` (no trailing slash: a redirect there breaks offline page loads). The service worker serves the opener page from its saved copy for any query.
- `src/lib/recover.ts` never clears saved copies or reloads when offline, or when the server does not answer (it used to, which wiped the offline copies exactly when they were needed).

## Editing and deleting
- **Edit:** every article has an Edit button (private ones on "My articles"; published ones for the owner). It opens the page's HTML with find and replace, and a Preview tab (safe frame). Nothing changes until Save. Saving a private article keeps the old version (Undo update). Saving a published one replaces it for everyone (version goes up).
- **Delete:** private articles: Remove (tap twice). Published: owner only, Delete asks for the owner password and removes it for everyone, including the copy kept on this device.

## Serving checklist (how each point of the hosting advice is handled)
- **Own address, no frame:** an article opens at `/articles/open?slug=...` as a normal page (the opener replaces itself with the article). A server-side `/raw` route is not used because the Android build has no server.
- **Saved settings:** each article gets its own private corner of localStorage (keys prefixed per article), so articles never overwrite each other and cannot read the app's own data. The app asks the phone to keep saved articles (`storage.persist`).
- **Caching:** articles are kept on the device by version and opened from there. No HTTP caching rules are needed for them.
- **Offline:** service worker (`public/sw.js`) and `manifest.webmanifest` exist. The article opener and the fonts are saved at install.
- **Fonts:** Inter, JetBrains Mono and Space Grotesk (latin, 400 to 700) are hosted in `public/fonts/articles`. A page that asks Google Fonts for only these families is switched to the local copy automatically (`localFonts` in `src/lib/articles/frame.ts`). A page that uses any other font family keeps its own link.

## Offline check
`src/lib/articles/offline.ts` lists what a page loads from the internet (code, styles, data requests, embedded pages = will not work offline; fonts, pictures, audio, video = missing). Fonts the app hosts and plain links are not counted. Shown when publishing, comparing, editing (Preview tab) and adding a private file, and as a badge on every card ("Saved on this phone, works offline" / "Not saved yet" / "N parts need internet").
