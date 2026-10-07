# EventScope — Code Structure Convention

This document defines the standard structure for every source file in this
project. Follow it for all new files and when editing existing ones, so the
codebase stays easy to navigate no matter who (or what) touches it next.

## 0. Project map — where things live

```
src/
  main.jsx                  App bootstrap (React root)
  App.jsx                   Screen gates (public / login / sign-up / app) + route table
  firebase.js               Firebase init (+ opt-in local emulator)
  index.css                 Tailwind theme tokens, brand font, print styles
  context/
    AppContext.jsx          ALL Firestore access + app state; exposes useApp()
  pages/                    One file per route/screen
    Dashboard, NewDraft, EditDraft, DraftsList, ConfirmedEvents (Confirmed + Completed),
    QuotationGenerator, BillGenerator, Reports (owner), JobLog (owner, own tab),
    Settings, Admin (platform admins), CreateCompany (sign-up),
    JoinInvite (accept/decline an invite), Login,
    Legal (Terms / Privacy / Data protection — public)
  components/               Reusable UI pieces
    Layout (sidebar + mobile nav), Button, Card, Input, Select, Modal, Toast,
    Badge, Toggle, LocationInput, ErrorBoundary,
    CostsPanel (costs on one event), JobLogColumnsEditor (Settings tab),
    ImportCompanyDialog (Admin: create a company from an old app's backup),
    AdminTeamDialog (Admin: a company's members/invites — change role, remove),
    AuthBackground (video behind sign-in / sign-up / invite screens)
  constants/
    data.js                 Defaults: event types, service categories, new-company
                            settings, Job Log columns, plans
    legal.js                Business details shown on the legal pages
  utils/
    helpers.js              Formatting, GST, IDs/links, dates, pricing, bill &
                            Job Log math, image resizing (no Firestore here)
    jobLogExcel.js          Job Log ⇄ .xlsx (exceljs, loaded on demand)
    tenantImport.js         Reads/cleans a backup file for "Import company" (no Firestore)
firestore.rules             Server-side security rules (source of truth for access)
tests/
  firestore.rules.test.mjs  Rules tests (emulator; also run on GitHub)
  helpers.test.mjs          Unit tests for money/bill math
  tenantImport.test.mjs     Unit tests for reading backup files
public/                     Logos, icons, manifest, service worker, login-bg.* (video),
                            export-bluebell.html (one-time old-app export — delete after migration)
```

**Where new code goes**

- Reads/writes to Firestore → a function in `AppContext.jsx`, in the section
  for its domain (events, settings, team, Job Log, admin…), returning
  `{ success, error }`. Pages never import from `firebase/firestore`.
- A new screen → `pages/`, plus a `<Route>` in `App.jsx`.
- UI used by more than one page, or a self-contained panel → `components/`.
- Pure calculation/formatting used in more than one place → `utils/helpers.js`,
  under the matching section banner (not appended at the end of the file).
- Fixed lists/defaults → `constants/`.
- Any new Firestore path → add it to the data map at the top of
  `AppContext.jsx` AND `firestore.rules`, with tests.
- When modifying a file, put new code inside the section it belongs to; if
  no section fits, add a new banner in the standard order (§2) rather than
  appending at the bottom.

## 1. File header banner

Every file starts with a block comment stating what the file is and its role
in the app:

```js
/**
 * <FileName> — <One-line purpose>
 *
 * <2-4 lines of context: what it owns, what depends on it, anything
 * a new contributor needs to know before editing.>
 */
```

## 2. Section banners

Inside a file, group related code under a standard banner so sections are
greppable and visually distinct:

```js
// ============================================================
// SECTION NAME
// ============================================================
```

Standard section names, in the order they should appear when present:

1. `IMPORTS`
2. `CONSTANTS` / `LOCAL STATE`
3. `HELPERS` (pure functions local to the file)
4. `SUB-COMPONENTS` (small components only used by this file)
5. `<ComponentName> — MAIN COMPONENT`
   - `STATE`
   - `DATA LOADING / EFFECTS`
   - `EVENT HANDLERS` (grouped by feature, e.g. `EVENT HANDLERS — FORM`, `EVENT HANDLERS — SUB-EVENTS`)
   - `VALIDATION`
   - `RENDER`
6. `EXPORTS` (only if not a single default export)

Not every section applies to every file — skip what doesn't apply, but keep
the ordering when multiple do.

## 3. Context/data-layer files (e.g. `AppContext.jsx`)

Organize by domain, not by CRUD verb. `AppContext.jsx` uses this order
(inside `AppProvider`, as `// ----` sub-banners):

```
STATE                               (grouped: auth, membership, company data, team, UI)
TOAST
AUTH STATE                          (listener + logout that clears the offline cache)
DATA LOADING — STEP 1: MEMBERSHIP   (users/{uid} → tenant, or a pending invite)
DATA LOADING — STEP 2: COMPANY DATA (live listeners)
DERIVED PERMISSIONS                 (role flags + writeBlockedReason)
PUBLIC SIGN-UP
INVITE — JOIN OR DECLINE
TEAM
EVENT OPERATIONS (CRUD)
SETTINGS OPERATIONS
CATEGORY OPERATIONS
JOB LOG / FINANCIALS
PLATFORM ADMIN
CONTEXT VALUE                       (grouped the same way)
```

Every async Firestore operation must:
- Be `async` and return a result the caller can check
  (`{ success: true, id }` or `{ success: false, error }`), never fire-and-forget.
- Never let the caller assume success — the caller decides what to show/do
  based on the returned result, not by guessing.

## 4. Pages that submit data (Forms)

`handleSubmit` must always:
1. Validate first, bail out early if invalid.
2. Set a `saving` state to `true` and disable the submit button (prevents
   double-submit and gives the user feedback).
3. `await` the save/update call.
4. Branch on the result: show success toast + navigate **only on success**;
   show the real error and stay on the page on failure.
5. Reset `saving` to `false` in a `finally` block.

## 5. Naming & comments

- Every non-trivial function gets a one-line `/** ... */` doc comment above it
  describing what it does, not how.
- Inline comments explain *why*, not *what* (the code already shows what).
- Keep section banners in ALL CAPS so they're visually distinct from doc
  comments.

## 6. When adding a new file

- Decide which existing folder it belongs in (`components/`, `pages/`,
  `context/`, `constants/`, `utils/`). Only create a new top-level folder if
  none of these fit (e.g. `hooks/` if custom hooks are introduced later).
- Apply the file header banner and the relevant section banners from day one
  — don't leave it unstructured "to fix later."

## 7. Firestore Security Rules

`firestore.rules` should live at the project root (not inside `src/`, since
it's deployed to Firebase, not bundled by Vite) and is tracked in git like
any other source file. See `firestore.rules` in this repo for the current
rules — keep it in sync with the Firestore paths used in `AppContext.jsx`.

**Multi-tenant rules of thumb**

- All company data lives under `tenants/{tenantId}/...`. Never read or write
  `users/{uid}/...` for business data — `users/{uid}` only maps a login to a
  tenant and role.
- Every page gets data through `useApp()`; never call Firestore from a page.
  `AppContext.jsx` is the only place that builds Firestore paths.
- Permission checks in the UI (`canEditEvents`, `canEditSettings`) are hints
  for a good experience. `firestore.rules` is what actually enforces them —
  change both together.
- Any change to `firestore.rules` must keep `npm run test:rules` green
  (runs on GitHub automatically: `.github/workflows/tests.yml`).

## 8. Local testing against the Firebase emulator

Create `.env.local` (git-ignored) with `VITE_USE_EMULATOR=true`, then run
`firebase emulators:start --only auth,firestore` alongside `npm run dev`.
The app then talks to the local emulator instead of the real project.
