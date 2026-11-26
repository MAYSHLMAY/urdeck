# Articles (Read area)

- **Where:** `/articles` (list), `/articles/view/?slug=...` (a published article), `/articles/mine/?id=...` (private, this device only). `/read` is still the PDF reader.
- **Published articles:** the owner picks an .html file on the Articles page (shown only when unlocked as owner). Everyone can then open it and use it. No login is needed to read. Stored in the `articles` table (run `supabase/articles.sql` once); read and written only through `/api/articles`.
- **Replacing:** publishing a file that is mostly the same as a published article (even with another file name) shows what changed and offers "Replace for everyone" (same address, version goes up) or "Publish as a new article instead".
- **Safety:** every article runs in `<iframe sandbox="allow-scripts">` with no access to the app's storage, login or page, plus a Content-Security-Policy that blocks all network requests from inside it (`src/lib/articles/frame.ts`).
- **Offline:** a published article opens offline after the first time it was opened.
- **Not built yet (on purpose):** article spec/renderer, generation pipeline, flashcard linking, SEO pages for each article.

## Updating an article by uploading the file again (My articles)
- Choose "Add an article from a file". The page is compared with every article here (yours and the public ones) by its **content**, not its file name (`src/lib/articles/diff.ts`).
- If most of an existing article's text is still there (50% or more), you get a compare screen: added, changed and removed lines (with the exact words changed), filters, next/previous change, folded unchanged lines, a switch for changes inside simulations and code, and a preview of the new file.
- Then you choose: **Replace the old one** (kept as a previous version, last 3 kept, **Undo update** on the row), **Add as a new article**, or Cancel.
- An identical file is recognised and nothing is changed. "Update from file" on a row compares against that article only, even if little matches.
- A matching published article offers "Save as my own copy" to everyone; only the owner can replace it for everyone.
