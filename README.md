# EventScope

**Every event, in focus.** Quotations, bills, a cost & profit Job Log and
reports for event management companies — one app, many companies, each
company's data kept separate.

- **Live site:** `https://akhilesh90akp.github.io/eventscope/` (GitHub Pages)
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
  not settings, team, reports or profit).
- `firestore.rules` enforces all of this on the server; the app's own
  checks only shape the UI. Rules are covered by `tests/firestore.rules.test.mjs`.
- EventScope platform admins are listed in `platformAdmins/{uid}`, added by
  hand in the Firebase console.

## Before going live with paying customers

- Fill in the business details in `src/constants/legal.js`.
- Have the Terms / Privacy pages reviewed by a lawyer.
- Deploy `firestore.rules` to the Firebase project and confirm the
  rules-test workflow is green.
