# Aarush Estimation

Measurement → quantity abstract → RAB bill → invoice, for many contractors and projects.
One app for **Android** (APK) and **Mac / any browser** (installable web app), synced through your own free Supabase database, with Excel export in the RAB workbook format.

| | Link |
|---|---|
| Web app (Mac, PC, any phone) | https://thameshcivil.github.io/aarush-estimation/ |
| Android APK (always the latest build) | https://github.com/thameshcivil/aarush-estimation/releases/latest |

## Install

- **Android:** open the APK link on your phone → tap `Aarush-Estimation.apk` → allow "Install unknown apps" for your browser when asked. New builds install over the old one (same signing key), and your data is kept.
- **Mac:** open the web app link in Chrome → Install icon at the right of the address bar (or Safari → File → Add to Dock).

## One-time cloud setup (sync between phone and Mac)

1. supabase.com → New project (region Mumbai).
2. SQL Editor → paste `supabase/supabase_setup.sql` → Run.
3. Authentication → Sign In / Providers → Email → turn off "Confirm email" (optional).
4. Project Settings → API → copy the Project URL and the anon public key, and either type them on the app's sign-in screen once per device, or put them in `window.AARUSH_CONFIG` in `src/index.html` and push – every device then connects automatically.

## Your data

No project data is stored in this repository – it is public. Your contractors, projects, measurements and bills live only on your devices and in your own Supabase database (protected by row-level security). Starter/backup files (`.json`) are kept privately and imported from the app: Settings → Import backup / starter data.

## How it is built

- `src/` – the app (plain JavaScript, no framework). `calc.js` does all bill maths, `excel.js` the Excel export, `app*.js` the screens, `sw.js` offline support.
- `tools/build.py` – inlines everything into one `www/index.html`.
- `android/` – Capacitor wrapper; the APK is just the same web app in an Android shell, with native Share/Files for Excel export.
- `.github/workflows/build.yml` – on every push: deploys the web app to GitHub Pages and builds the APK, published as the `latest` release.

Local build: `npm ci && python3 tools/build.py && npx cap sync android` (Android Studio for a local APK).
