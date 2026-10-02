# Bluebell App — Code Structure Convention

This document defines the standard structure for every source file in this
project. Follow it for all new files and when editing existing ones, so the
codebase stays easy to navigate no matter who (or what) touches it next.

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

Organize by domain, not by CRUD verb:

```
// ============================================================
// AUTH STATE
// ============================================================

// ============================================================
// EVENT OPERATIONS (CRUD)
// ============================================================

// ============================================================
// SETTINGS OPERATIONS
// ============================================================

// ============================================================
// CATEGORY OPERATIONS
// ============================================================
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
