# EventScope

**Every event, in focus.** Quotations, bills, a cost & profit Job Log, purchases and
reports for event management companies — one app, many companies, each
company's data kept separate.

- **Live site:** `https://app.eventscope.in/` (Firebase Hosting)
- **Stack:** React + Vite + Tailwind CSS, Firebase Auth (Google sign-in) and
  Cloud Firestore, installable as a PWA.

## Getting started

```bash
npm install
npm run dev          # local dev server
npm run build        # production build into dist/
npm run lint         # oxlint
npm run test:unit    # money/bill math tests (no network needed)
npm run test:rules   # Firestore security-rules tests (needs the Firebase emulator)
```

Pushing to `main` deploys automatically (`.github/workflows/deploy.yml`) and
runs the unit and security-rules tests (`.github/workflows/tests.yml`).

## How it's organised

See **[CODE_STRUCTURE.md](CODE_STRUCTURE.md)** — file layout, where new code
goes, the section/banner convention every file follows, and the
multi-tenant data rules.

## Security model (short version)

- Every company (tenant) has its own data under `tenants/{tenantId}/…`.
- `users/{uid}` links each Google login to one company with a role:
  **owner** (everything) or **staff** (events, quotes, bills, costs —
  not settings, team, reports, profit or purchases).
- `firestore.rules` enforces all of this on the server; the app's own
  checks only shape the UI. Rules are covered by `tests/firestore.rules.test.mjs`.
- EventScope platform admins are listed in `platformAdmins/{uid}`, added by
  hand in the Firebase console.

## Before going live with paying customers

- Fill in the business details in `src/constants/legal.js`.
- Have the Terms / Privacy pages reviewed by a lawyer.
- Deploy `firestore.rules` to the Firebase project and confirm the
  rules-test workflow is green.

## Hosting

The app is served from Firebase Hosting at `https://app.eventscope.in/` (project
`eventscope-app`). Sign-in uses the same address (`authDomain` in `src/firebase.js`),
which is what lets Google sign-in work in the iPhone home-screen app.
Every push to `main` publishes through `.github/workflows/deploy.yml`, using the
GitHub secret `FIREBASE_SERVICE_ACCOUNT`.

The marketing site lives in `website/` and is served at `https://eventscope.in/` as a
second Firebase Hosting site (`eventscope-site`, target `site` in `.firebaserc`). It is
plain files, so there is nothing to build. The same deploy workflow publishes it. The
WhatsApp contact number is not in git: add the GitHub secret `SITE_WHATSAPP` (digits
only, with country code) and the deploy puts it into the website's WhatsApp buttons.
Preview locally with `python3 -m http.server -d website 8099`.
