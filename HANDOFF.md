# Handoff — read this first if you're picking up this project fresh

This file exists so a new Claude Code session (or a human) can get oriented
without re-deriving everything from scratch. If you're an AI assistant reading
this at the start of a session, read this whole file before doing anything else.

## What this project is

`README.md` covers the app itself (a hotel compliance/maintenance tracker).
This file covers *state* — what's been done, what's live, what's still open.

## Current state (as of this handoff)

- **Live and deployed**: https://compliance-ledger.onrender.com, also reachable at
  the custom domain https://buttcheekslibrary.com (GoDaddy DNS → Render, cert
  issued) — a real Render web service, auto-deploying on every push to `main`
  on GitHub (`github.com/mckml69/TKDH`).
- **Real per-user password authentication** is built and working (`server/auth.js`,
  `/api/auth/*` routes in `server/index.js`) — replacing the original prototype's
  "pick your name" sign-in. See `server/README.md` → "Locked out?" if you need to
  reset a password without a working login.
- **The frontend and backend are combined into one deployable service.** Express
  serves the built Vite frontend directly (see the bottom of `server/index.js`) —
  there's no separate frontend host. `render.yaml` is the deploy blueprint.
- **Report branding** (logo, business name, address, registration number, footer)
  is built and applies to every exported report — see `src/components/settings/Branding.jsx`.
- **The Fire Log weekly export** matches the customer's actual paper form
  (`Fire Weekly Compliance Sheet.xls`), Monday-first per the app's own internal
  week logic — not Sunday-first like the original paper form.
- **Window Restriction Checks can now be exported too** — this was the one
  major record type with no export at all (confirmed: not broken, genuinely
  never built — `checkpointCheckExportSource` in `helpers.js` existed, tested,
  and had zero callers). `WindowChecksExportPage` (`src/components/windowchecks/
  WindowChecks.jsx`), reachable via "Export for an inspection" on the Window
  Restriction menu (General Manager only). One row per (checkpoint, month) over
  a date range, via the existing generic `registerPdf.js` table builder — no
  new PDF builder needed, since unlike Fire Log there's no per-item checklist
  grid, just status/note/who per checkpoint per month. A checkpoint with no
  record for a given month shows as "Not logged" rather than being silently
  skipped, so gaps stay visible to whoever reviews it. New pure helper
  `checkpointCheckPeriodsInRange` in `helpers.js` (tested) mirrors
  `fireLogWeeksInRange`'s role for months instead of weeks.
- **Legionella Checks** (new, checkpoint-based, same golden-rule export gating
  as Window Restriction) — replaces the old "Kettle descaling"/"Shower head
  descale" free-text presets on the per-asset Legionella category. Everything
  else in that category (water tank inspection, calorifier check, TMV
  servicing, water sample/analysis) is untouched — those stay one-off/
  asset-level checks, not periodic. Reached via a new "Legionella Checks" nav
  item under Checks, which opens a small menu (`LegionellaChecksMenuPage` in
  `src/components/legionella/LegionellaChecks.jsx`) with two independent
  sub-flows:
  - **Descaling** — quarterly, one record per (checkpoint, quarter) holding a
    `checks: { kettle, shower_head, tap }` map, each fixture independently
    tickable, only showing the fixture types actually linked to that
    checkpoint (`legionellaCheckEligibleItems` in `helpers.js`). New
    `legionellaCheck*` helpers (period math, lock/snapshot, per-item export
    merge) are a deliberate parallel to `checkpointCheck*`/`fireLog*` rather
    than generalizing either — quarterly periods needed new period math,
    multi-item-per-record needed Fire Log's per-item merge shape, and the two
    just don't share a common ancestor worth factoring out.
  - **Water Temperature** — monthly, one hot + one cold °C reading per
    checkpoint per month, eligible once a checkpoint has a tap or shower head
    linked (kettles don't count). Reuses `checkpointCheck*`'s month/lock math
    directly (it was already generic, not actually Window-Restriction-specific)
    plus new `legionellaTempCheck*` functions for the two extra numeric fields.
  - Two new asset types, `shower_head` and `tap` (`ASSET_TYPES` in
    `constants.js`) — alongside the existing `kettle`, all three can now be
    linked to **both** a Room (general maintenance, unchanged) **and** a
    Checkpoint (Legionella-check eligibility) at once — `AssetFormPage` in
    `Assets.jsx` renders both selects together for these three asset types,
    rather than the Room-or-Checkpoint either/or that Window Restriction uses.
  - Not-OK on either check raises a maintenance issue exactly like Window
    Restriction; for Descaling specifically, since one record can have up to
    three independently-resolved items, the linked maintenance record's
    `linkedRecordId` is a composite `"<recordId>:<itemKey>"` and `resolvedVia`
    is keyed per item (`{ kettle: "...", shower_head: "..." }`) rather than a
    single flag, so resolving one fixture's issue doesn't affect another's.
  - **Known gap, not fixed here** (see below): tapping "OK" directly on an
    item that's currently "Not OK" silently overwrites its note and leaves any
    linked-but-open maintenance issue orphaned, with no trace on export. This
    is a pre-existing Window Restriction bug (`handleSaveWindowCheckOk` in
    `App.jsx`) that Legionella's `handleSaveLegionellaCheckOk`/
    `handleSaveLegionellaTempCheck` inherit by design, for consistency between
    the two systems — flagged by the user, deliberately deferred rather than
    fixed piecemeal mid-build.
- **Every export produces a real PDF now**, not HTML — `src/lib/pdf/` (pdf-lib,
  entirely client-side, no server/storage involved). This replaced a
  deliberate HTML-only workaround from this app's original single-file
  Claude.ai artifact days, where `pdf-lib` wasn't on that sandbox's approved-
  package allowlist — now that this is a real npm project, that restriction is
  gone. See `README.md` → "Report export" for the architecture (`pdfKit.js`
  shared toolkit, `registerPdf.js` for the flowing register/Ledger/Audit
  reports, `fireLogPdf.js` for the bespoke Fire Log grid). One real gotcha hit
  and fixed along the way: pdf-lib's standard fonts can't encode the ✓
  character as text at all (WinAnsi encoding has no glyph for it) — it's now
  drawn as a small vector mark instead. All 9 report types were hand-verified
  by generating a real PDF and checking its actual extracted text content, not
  just "the code compiles."
- **Attachments are stored in Cloudflare R2**, not base64-in-database — the four
  `R2_*` env vars are set on Render and live uploads/downloads are confirmed
  working end to end. See `server/README.md` → "Attachments / object storage"
  for how the dual-mode (R2 vs. legacy base64) fallback works, and `server/r2.js`.
  One gotcha hit and fixed along the way: the AWS SDK v3 client's default
  flexible-checksum headers aren't compatible with R2 and made every
  upload/download fail with no useful error until checksum calculation/validation
  was explicitly set to `"WHEN_REQUIRED"` in the S3Client config.
- **Visual redesign (TKDH branding)**: new color palette (`src/styles/global.css`
  `.app` custom properties — sidebar `#123F4A`, primary/accent `#197386`/`#43A6A1`,
  status colors remapped in `STATUS_META`), Manrope replacing Fraunces/Inter as
  the UI font (Fraunces kept only for the "TKDH" sidebar/sign-in brand mark),
  restyled sidebar/topbar (a proper name+role dropdown replaces the old inline
  "Signed in as… Change password Sign out" row), empty-state cards redesigned
  (solid border, action moved inside the card — see `ResponsiblePersonCard`/
  `BrandingCard`), and the Home dashboard's four-paragraph "briefing" prose
  replaced with a `.stat-row` of real numbers + one short greeting line (same
  underlying data, just no longer buried in sentences). Real logo asset at
  `public/tkdh-logo.png`, used as the favicon and on the sign-in screen.

## Things fixed along the way, worth knowing about

The original handover package (see `README.md`'s own "What's new in this
rebuild" section) had several latent bugs from the split — missing imports that
silently broke exports and the Home dashboard. These are all fixed now, but if
something *else* throws `"X is not defined"` in the browser console, check the
import line at the top of that file first — it's happened enough times in this
codebase that it's the first thing worth ruling out.

A blanket CSS rule (`.app, .app * { color:var(--ink); }` in `src/styles/global.css`)
overrides color on every single element, including SVG icons that use
`currentColor`. **This turned out to be the real cause of the "sidebar icons
render as invisible/black" issue** noted in earlier handoffs as an unsolved,
seemingly machine-specific rendering quirk — it wasn't machine-specific at
all. `.app *` matches not just the `<svg>` tag but every shape *inside* it
(`<path>`, `<line>`, etc.), and those inner shapes' own `stroke="currentColor"`
resolves from *their own* computed `color`, not the parent `<svg>`'s — so a
fix that only restored color on the `<svg>` element itself (the original
`.app svg { color: inherit; }`) left every icon's actual drawn shape still
pinned to dark ink. It was invisible for so long because the old sidebar
background was itself near-black (`#16263D`) — dark ink on near-black is
imperceptible. The moment the sidebar got a lighter color as part of the
visual redesign, the same dark icons became obviously wrong, which is what
made this findable. Fixed by widening the override to `.app svg, .app svg *
{ color: inherit; }` — covers the `<svg>` tag and everything drawn inside it.
If something *else* still renders in the wrong color on a colored background,
this same pattern (a more specific `color` rule on the actual element, not
just its container) is the fix.

## Known open items, roughly in priority order

1. **Database migration** — the backend still uses the simple `kv_store` table,
   not the relational schema in `server/db/schema.sql`. Real, scoped, deliberately
   deferred work — see `server/README.md`.
2. **Automated tests** — five Vitest suites exist now, frontend and backend
   as separate npm packages each with their own `npm test`: `src/lib/helpers.test.js`,
   `src/lib/fireLog.test.js`, `src/lib/search.test.js` (pure date/status/
   validation logic, the Fire Log/Window Restriction period-lock/export-merge
   machinery, and the search/haystack + Compliance Library matching logic),
   and `src/lib/pdf/pdf.test.js` (structural tests for the PDF builders — run
   at the repo root, 140 tests total) and `server/index.test.js` (real
   integration tests against the Express app + a throwaway SQLite file via
   `supertest` — auth lifecycle, storage routes, R2 fallback path — run
   inside `server/`, 12 tests). `vite.config.js` explicitly excludes
   `server/**` from the root test run since it's a separate package with its
   own dependencies. Essentially all pure business logic in `helpers.js` is
   covered now, plus the PDF export layer; what's left is the UI itself.
3. **OK-override silently loses a Not-OK note / orphans its maintenance issue**
   — on Window Restriction, Legionella Descaling, and Legionella Water
   Temperature checks alike: tapping "OK" directly on an item that's
   currently "Not OK" (bypassing the Resolve flow) overwrites its status/note
   with no check for an already-open linked maintenance issue. The note is
   gone, the maintenance issue is left open with nothing pointing back at it,
   and the golden-rule PDF export shows a clean "OK" for that period with no
   trace anything was ever wrong (the export only reads live status/note,
   never `record.history`). Needs a deliberate design decision — block the
   direct override when an open linked maintenance issue exists and force
   Resolve instead? Auto-resolve the linked issue? — not a quick patch.
   `handleSaveWindowCheckOk`, `handleSaveLegionellaCheckOk`, and
   `handleSaveLegionellaTempCheck` in `App.jsx` all share this gap.
## Getting set up on a new machine

```bash
git clone https://github.com/mckml69/TKDH.git
cd TKDH
npm install
cp .env.example .env              # VITE_STORAGE_MODE=local is fine for a first look
cd server
npm install
cp .env.example .env
cd ..
npm run dev                        # http://localhost:5173, local-storage mode
```

To develop against the real backend instead of local-storage mode:
`.env` → `VITE_STORAGE_MODE=api`, then `cd server && npm start` (separately) —
see the root `README.md` Quickstart for the full local dev flow.

**On Windows, `cd server && npm install` needs a C++ build toolchain** —
`better-sqlite3` compiles a native module (`node-gyp rebuild`), and this fails
with a Python-version error if only an old/unsupported Python is on PATH, or
silently does nothing if the environment's npm has a script-approval gate
(`npm warn allow-scripts` — run `npm approve-scripts better-sqlite3` first,
then `npm rebuild better-sqlite3`). A working setup needs a real Python 3.x
and Visual Studio Build Tools with the "Desktop development with C++"
workload; both installed cleanly via `winget install Python.Python.3.12` and
`winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet
--wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`.

**Do not commit `.env`, `server/.env`, or `server/data.sqlite`** — all gitignored
on purpose. `server/data.sqlite` in particular is a *local* database; it has
nothing to do with the production data living on Render's persistent disk.
