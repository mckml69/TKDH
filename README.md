# Compliance Ledger

A hotel compliance, maintenance, and audit-trail application: fire/legionella/equipment
checks, an asset and room register, contractors & suppliers, staff and training,
certificates, regulatory (EHO/Fire Officer) visit logs, a two-role permission model
(General Manager / Employee) with a correction-request workflow, and a Compliance
Library that cross-references what's actually been logged against what's required.

This package is the result of splitting a working prototype (originally built and
tested as a single-file React app inside an AI chat artifact) into a normal,
buildable multi-file project, plus the scaffolding needed to run it as a real web
app outside that environment. **Read "What's real vs. simulated" below before doing
anything else with this — it matters.**

---

## What's real vs. simulated (read this first)

This app was originally prototyped inside a sandboxed environment that provided
a simple `window.storage.get/set/delete` API for free, with no server and no
real authentication. That shaped how storage works, and used to shape
authentication too — but the auth story below has since moved on from the
prototype. Worth knowing about either way:

**Storage.** Every hook in `src/hooks/` still calls `window.storage.*` directly.
Outside the original sandbox, nothing provides that — so `src/lib/storage/`
polyfills it. Two adapters are included:
- **`localAdapter`** (default): stores everything in the browser's own
  `localStorage`. Zero backend required, good for a first look at the UI. Data is
  **not shared** between devices/users and is lost if the browser's storage is
  cleared. This is a development convenience, not a real solution.
- **`apiAdapter`**: talks to a real backend over HTTP. A minimal, *tested and
  working* reference server is included in `/server` (see below) — but see its own
  caveats before trusting it with real data.

**Authentication is real now.** The original prototype had no passwords at all —
signing in was honestly presented as "pick your name from the list," accountability
and workflow enforcement, not an access-control boundary. That's since been
replaced: `server/auth.js` implements real per-person password hashing (`scrypt`)
and httpOnly-cookie sessions, enforced on every `/api/*` request once the first
account is bootstrapped. See `server/README.md` and `HANDOFF.md` for how it works
and how to reset a password if you're locked out. The General Manager / Employee
role split is layered on top of that and, same as before, is genuinely enforced in
the UI (Employees can't reach the Edit button, can't see the Certificates
register, etc.) with every action attributed to a real, named user.

This only applies in **API mode** (`VITE_STORAGE_MODE=api`, talking to the real
backend) — **local-storage mode has no backend at all**, so there's nothing for a
password to authenticate against; its own lightweight name+email bootstrap screen
is a dev/demo convenience, not a security boundary, exactly like the storage
itself in that mode.

Neither of these was a bug to be quietly patched over. They were documented,
deliberate scope boundaries from the prototype phase, clearly labelled so whoever
continued this knew exactly what to build next and why it wasn't already
built — auth is that story playing out; the database migration in "Next steps"
below is the same pattern, still open.

---

## Quickstart

```bash
# 1. Frontend, no backend at all — fastest way to see the UI
npm install
cp .env.example .env      # VITE_STORAGE_MODE=local is the default, no edit needed
npm run dev                # -> http://localhost:5173
```

That's enough to click through every screen. Data lives only in your browser.

To run it with the real (reference) backend instead:

```bash
# 2. Reference backend
cd server
npm install
cp .env.example .env
npm start                  # -> http://localhost:4000

# 3. Point the frontend at it
cd ..
# edit .env: VITE_STORAGE_MODE=api
npm run dev
```

---

## Project structure

```
compliance-ledger/
├── index.html
├── package.json
├── vite.config.js
├── .env.example
├── src/
│   ├── main.jsx                 entry point — installs the storage adapter, renders <App/>
│   ├── App.jsx                  routing/state orchestration (stack-based navigation, all the
│   │                             top-level handlers). This is the biggest file and the one
│   │                             most worth reading first to understand how everything connects.
│   ├── lib/
│   │   ├── constants.js         TEMPLATES, ASSET_TYPES, ROOM_TYPES, REQUIREMENTS (the
│   │   │                        Compliance Library's built-in reference content), status
│   │   │                        vocab, FIRE_LOG_ITEMS, CATEGORY_FILTER_GROUPS, and every
│   │   │                        *_HISTORY_FIELDS map used for diffing.
│   │   ├── helpers.js           pure functions: date/status logic, search, validation,
│   │   │                        pattern detection (recurring issues, repeat contractors),
│   │   │                        and the Fire Log / Window Restriction period-locking and
│   │   │                        frozen-snapshot logic.
│   │   ├── pdf/                 real PDF export (pdf-lib, entirely client-side) — see
│   │   │                        "Report export" below.
│   │   ├── auditTrail.js        computeUpsert/Archive/Restore — the audit-trail engine.
│   │   │                        Every entity's create/edit/archive/restore goes through
│   │   │                        these three functions, which is what makes "every action
│   │   │                        records the user, date and time" true everywhere at once
│   │   │                        instead of being reimplemented per entity.
│   │   └── storage/             the adapter layer described above.
│   ├── hooks/                   useLedger (records/assets/rooms/checkpoints/contractors/
│   │                             staff/certificates/visits — yes, all in one hook, see note
│   │                             below), useUsers, useCurrentUser, useAudit,
│   │                             useResponsiblePerson.
│   ├── components/
│   │   ├── shared/               FormPage, AttachmentsField (camera/voice-note/file capture,
│   │   │                         plus an inline viewer since downloading isn't reliable in
│   │   │                         every environment), Stamp, Timeline, HistoryList.
│   │   ├── records/               the Ledger, record forms (including the maintenance
│   │   │                         Awaiting/Resolved-by workflow), correction-request flow.
│   │   ├── assets/, rooms/, contractors/, staff/, certificates/, visits/, users/,
│   │   │   checkpoints/          one file per register — form, detail page, list page.
│   │   │                         checkpoints/ is deliberately separate from rooms/ — a
│   │   │                         checkpoint is a physical check location that isn't always
│   │   │                         a hotel room (corridors, reception, the bar).
│   │   ├── firelog/               Fire Log's dedicated screens — its own period-locking,
│   │   │                         frozen-export-snapshot, and blank-record-blocking system,
│   │   │                         built to the standard the Fire Safety Order actually needs.
│   │   ├── windowchecks/          Window Restriction's fast tick-list, built the same way
│   │   │                         as Fire Log for the same reasons — see the business-rules
│   │   │                         discussion in project history for why that scope was kept.
│   │   ├── dashboard/            Home, the morning-briefing panel.
│   │   ├── library/               the Compliance Library and its per-requirement detail page.
│   │   ├── audit/                 the "First Day Audit" self-assessment wizard.
│   │   └── search/                global search across every entity type.
│   └── styles/global.css         all of the app's CSS (extracted from what was originally
│                                  one inline <style> block — see "Styling" below).
└── server/                       reference backend — see server/README.md
```

**Why `useLedger` holds eight entity types at once**: they share almost identical
CRUD/archive/history logic (that's the whole point of `auditTrail.js`), and in the
original prototype keeping them in one hook made cross-entity operations (e.g. "when
you save a flagged check, auto-create a linked maintenance record") straightforward
because everything was already in one place. If you split this further, that's a
reasonable refactor — just make sure the cross-entity side effects in `App.jsx`
(search for `handleSaveRecord`, `handleSaveWindowCheck`, `handleResolve`) move with it.

---

## What's new in this rebuild

This package was originally built before Fire Log, Window Restriction, Checkpoints,
and the maintenance Awaiting/Resolved-by workflow existed in the single-file prototype.
This rebuild brings it fully up to date with the current app — every one of those
systems, plus a handful of real bugs in the *original* package that surfaced along the
way (a missing `diffFields` export, a missing `todayStr` import in the audit engine, a
missing `formatHistoryValue` function that had never actually been extracted anywhere).
All of it has been verified against a real, running build — not just a passing
`npm run build` — since a clean build only confirms imports resolve, not that the
underlying logic is correct or even present. See the runtime test pattern in
`runtime-test.cjs`-style scripts (not included in this package, but worth writing one
like it) if you want to re-verify after further changes.

The shapes below are what the frontend already sends/expects. `server/db/schema.sql`
translates this into a proper relational schema — see "Database" below for how the
two relate.

- **Room** — number, floor, type.
- **Asset** — type, code (auto-generated, e.g. `FE-014`), optional room link.
- **Contractor** (labelled "Contractors & Suppliers" in the UI) — anyone external
  who services the building or supplies it, with optional insurance expiry.
- **Staff** — name, role; training records and general work link back to a person
  instead of a typed name string.
- **Certificate** — a standalone document (Gas Safety, EICR, insurance, etc.) with
  its own expiry, optionally linked to the contractor who issued it and/or the
  asset it covers.
- **Regulatory Visit** — an EHO/Fire Officer/other official visit; a visit with
  outstanding actions auto-creates a linked Maintenance record.
- **Record** — the actual compliance log entries: recurring checks, incidents,
  maintenance issues, training completions, deep cleans, room inspections/photos.
  Shape varies by `category`/mode — see `TEMPLATES` in `constants.js`.
- **User** — name, email, role (`Employee` | `General Manager`). See the auth
  caveat above.
- Every entity above carries an append-only `history` array (who, when, what
  changed) and `archived`/`archivedAt` (soft-delete only — nothing is ever
  destroyed; see `auditTrail.js`).

---

## Installation

Requires Node.js 18+.

```bash
npm install                 # frontend
cd server && npm install    # reference backend (optional)
```

## Dependencies

**Frontend**: `react`, `react-dom`, `lucide-react` (icons), `vite` +
`@vitejs/plugin-react` (dev). No CSS framework — all styling is hand-written in
`src/styles/global.css`, no CSS-in-JS, no Tailwind.

**Reference backend**: `express`, `cors`, `better-sqlite3`. Deliberately minimal —
see `server/README.md`.

## Environment variables

See `.env.example` (frontend) and `server/.env.example` (backend) — both are
copy-and-go with sensible defaults for local development.

## Database

See `server/README.md` and `server/db/schema.sql`. Short version: the reference
server as shipped uses the *simplest possible* backing store (one key-value table)
to get something real and testable running quickly — it is **not** the same as
the relational schema in `schema.sql`, which is the properly-normalized target
schema documented for when this app is ready to be modelled correctly. Migrating
from one to the other is real, scoped work — see "Next steps".

---

## Report export

Every register export, the Compliance Ledger, the First Day Audit gap report,
and the Fire Log produce a **real PDF** (`src/lib/pdf/`), generated entirely
client-side with `pdf-lib` — no server or storage involved, same as everything
else about export. `pdf-lib` is low-level (you place text/lines by hand, no
built-in tables), so there's a small custom layout toolkit on top of it:

- `pdfKit.js` — shared primitives: page/cursor management with automatic
  pagination, word-wrapped text, a generic table renderer, the status chips
  (reusing `STATUS_META`'s colors/labels), letterhead (logo + business
  details), footer. One real gotcha worth knowing if you touch this: pdf-lib's
  standard fonts use WinAnsi encoding, which has **no glyph for ✓** (throws if
  you try to draw it as text) — `checkmark()` draws it as two vector strokes
  instead, and `table()` special-cases a literal `"✓"` cell value to use it.
- `registerPdf.js` — the generic flowing document (heading/paragraph/table
  blocks) used by every register, the Ledger, and the Audit gap report.
- `fireLogPdf.js` — a bespoke builder mirroring the Fire Log's exact paper-form
  grid (one real PDF page per Monday-start week) — not a flowing table, so it
  doesn't go through `registerPdf.js`.
- `exportPdf.js` — the same three-tier share/download/fallback strategy the
  export always used (native Share sheet → direct download → an in-app
  `<embed>` view for the rare browser where both are blocked), just producing
  `application/pdf` instead of `text/html`.

This replaced an HTML-only export that was a deliberate workaround from this
app's original single-file Claude.ai artifact days — `pdf-lib` (proven to work
even then) wasn't on that sandbox's approved-package allowlist. Once this
became a real npm project, that restriction no longer applied.

## Styling & mobile

All CSS lives in `src/styles/global.css`, plain CSS with custom properties, no
build-time preprocessing. There's a single `@media (max-width: 780px)` block
handling phone-sized layouts (tables collapse to cards, forms stack to one column,
touch targets are sized up). This was verified by static CSS parsing and a real
`vite build`, but **not visually verified on an actual device** — the tooling used
to build this package does not render pages, so treat the mobile layout as
"should work, needs a real phone to confirm," not "confirmed."

## Known limitations / honest gaps

- Real authentication exists (see "What's real vs. simulated" above), but only
  in API mode — local-storage mode still has no access-control boundary, on
  purpose, since there's no backend in that mode for a password to check against.
- Attachments are base64-in-database by default; optionally offloaded to
  Cloudflare R2 when the `R2_*` env vars are set — see `server/README.md`
  "Attachments / object storage".
- Four Vitest suites exist so far — frontend and backend are separate npm
  packages, each with its own independent `npm test`:
  - `src/lib/helpers.test.js` — pure date arithmetic (including the timezone
    bug described above), record status/due-date logic, and every form validator.
  - `src/lib/fireLog.test.js` — the Fire Log and Window Restriction period/lock/
    export-merge logic: period keys and labels, lock boundaries, the frozen-
    snapshot merge rules (late filing vs. a real correction), the weekly-key
    repair function, and the timezone-bug detector itself.
  - `src/lib/search.test.js` — the haystack/search builders, `universalSearch`
    (including the built-in REQUIREMENTS reference list), the Compliance
    Library's requirement-matching logic, and the asset/staff compliance
    rollup functions.
  - `server/index.test.js` — real integration tests against the actual Express
    app and a real, throwaway SQLite file (via `supertest`), not mocks: the full
    auth lifecycle (bootstrap, login, session, logout), the generic storage
    routes, and the R2 attachment fallback path.
  - `src/lib/pdf/pdf.test.js` — structural tests for the PDF export builders
    (valid PDF output, page counts/pagination, the empty-data and no-branding
    edge cases, and a regression test for the WinAnsi ✓-glyph bug described
    in "Report export" above). Not visual/snapshot tests — every PDF report
    type was also hand-verified once by generating a real file and checking
    its actual extracted text content matched expectations.
  Between these, essentially all of the pure business logic in `helpers.js` is
  now covered, plus the PDF export layer. What's left untested is the UI
  itself. Testing beyond these suites has been: (a) a real `vite build`
  succeeding with zero errors, (b) extensive interactive testing of the original
  single-file prototype before the split (every feature described
  in this README was built and manually tested at some point) — but the *split*
  itself has only been build-verified, not re-run through that full interactive
  test pass. Do that before trusting this deeply.
- Voice-note transcription depends on the Web Speech API, which is inconsistently
  supported across browsers (works in Chromium-based browsers, not reliably
  elsewhere). The audio recording itself is the reliable part; transcription is
  best-effort on top of it.

## Next steps

This list was accurate at the original handover and has since gone stale in
places (real authentication and object storage for attachments both shipped;
a real test suite exists now) — **`HANDOFF.md` is the up-to-date, living
version of this list**, kept current as work actually lands. What's still
genuinely open, as of the last update there:

1. **Migrate the reference server from the `kv_store` table to `schema.sql`'s
   relational schema.** The biggest real piece of work left: rewriting the API
   routes to read/write normalized rows instead of JSON blobs, one entity type
   at a time. `useLedger.js` and the other hooks would keep working via the same
   `window.storage` contract as long as the API layer keeps translating.
2. **More automated test coverage** — a real suite exists (`npm test`, both
   frontend and backend) but doesn't yet cover the UI itself; see `HANDOFF.md`
   for exactly what's covered and what isn't.
