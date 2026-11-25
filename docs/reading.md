# Articles (Read area), phase 1

- **Where:** `/articles` (list), `/articles/<slug>` (article), `/articles/mine?id=...` (private, this device only). `/read` is still the PDF reader.
- **Public:** nobody needs to sign in. The Home page has an Articles card (Explore) and the top bar has an Articles link.
- **Files:** `public/articles-data/<slug>/v<N>/index.html`, listed in `public/articles-data/index.json` (title, slug, summary, cover, tags, author, language, version, published_at, reading_minutes, status draft/review/published, outline). Only `published` entries show. All reading of these files goes through `src/lib/articles/source.ts`, so moving to object storage later means changing that file only.
- **Publish an article:** add a folder `<slug>/v1/index.html`, add its entry to `index.json` with `"status": "published"`, deploy. A new version is `v2/` and `"version": 2` (old versions stay).
- **Safety:** every article runs in `<iframe sandbox="allow-scripts">` with no same-origin access (no cookies, storage, login or page access). `src/lib/articles/frame.ts` also adds a Content-Security-Policy that blocks all network requests and form posts from inside the article.
- **Layout:** the frame fills the screen under a slim bar; the article scrolls inside it (it has its own sticky bars). A skeleton shows until the article reports it is ready.
- **Offline:** the service worker keeps the article file after the first open.
- **My articles:** a person can add an .html or .txt file for themselves. It is stored in this browser or app (IndexedDB `ud-articles-v1`), never uploaded, and shown in the same sandbox. Limit 6 MB each.
- **SEO:** the list and article pages are static HTML with title, description, Open Graph, JSON-LD, a visible summary and a contents list.
- **Known limits:** the article does not remember its own settings (theme, reading progress) because the sandbox blocks storage; fonts come from Google Fonts online and fall back to system fonts offline. Both are addressed in phase 2/4 (progress bridged through the app).

## Updating an article by uploading the file again (My articles)
- Choose "Add an article from a file". The page is compared with every article here (yours and the public ones) by its **content**, not its file name (`src/lib/articles/diff.ts`).
- If most of an existing article's text is still there (50% or more), you get a compare screen: added, changed and removed lines (with the exact words changed), filters, next/previous change, folded unchanged lines, a switch for changes inside simulations and code, and a preview of the new file.
- Then you choose: **Replace the old one** (kept as a previous version, last 3 kept, **Undo update** on the row), **Add as a new article**, or Cancel.
- An identical file is recognised and nothing is changed. "Update from file" on a row compares against that article only, even if little matches.
- Public articles cannot be replaced from the app (they are files on the server). A matching public article offers "Save as my own copy". Updating the public one means publishing `v2` (see above); a later owner-only upload can automate that.
