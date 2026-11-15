# UrDeck as an Android app (APK)

The app is your same website code, packed with Capacitor. The pages and 3D files are inside the APK, so it opens instantly and works offline for studying. Anything that needs the server (cards you add, device sync, live quiz, AI helper) talks to your website.

## Get the APK with GitHub (no Android Studio needed)

1. Create a new GitHub repository and push this whole folder to it (branch `main`).
2. In the repo open **Settings → Secrets and variables → Actions → Variables → New repository variable** and add three variables:
   - `API_BASE` = your website, for example `https://urdeck.vercel.app` (no slash at the end)
   - `NEXT_PUBLIC_SUPABASE_URL` = the same value you put in Vercel
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the same value you put in Vercel (the public anon key; never the service-role key)
3. Open the **Actions** tab → **Build Android APK** → **Run workflow** (it also runs on every push to `main`).
4. When it turns green (about 6 to 10 minutes), open the run and download **UrDeck-apk** at the bottom. Unzip it and send `UrDeck.apk` to your phone.
5. On the phone open the file and allow "Install unknown apps" for that app when asked.

## Updating
Push your changes, run the workflow again, install the new APK over the old one. Every build is signed with the same key, so it installs as an update and keeps your cards, progress and settings.

## Notes
- The owner password and your server keys stay on your server. The APK only contains the public Supabase address and anon key, as the website does.
- Study reminders (push notifications) are for the website only for now; the APK shows no reminders yet.
- Links you share (duel, sync code, live-quiz join) use your website address, so friends can open them in any browser.
- The signing key in `android/app/flightrecall.keystore` is a convenience key. Before putting the app on the Play Store, make your own private key, add it as GitHub secrets (`KEYSTORE_FILE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) and keep it safe.

## Changing things
- Icon and splash: edit `resources/logo-fg.svg` and `resources/logo-bg.svg`, then run `node scripts/make-icons.mjs`.
- App name: `capacitor.config.json` and `android/app/src/main/res/values/strings.xml`.
- Build on your own computer: `API_BASE=https://your-site npm run android:sync` then `npm run android:open` (needs Android Studio).
