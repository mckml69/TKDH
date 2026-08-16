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

This app was prototyped inside a sandboxed environment that provided a simple
`window.storage.get/set/delete` API for free, with no server and no real
authentication. That shaped two things you need to know about before treating this
as production-ready:

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

**Authentication.** The General Manager / Employee roles are real in the sense
that the UI genuinely enforces them (Employees can't reach the Edit button, can't
see the Certificates register, etc.) and every action is attributed to a real,
named user. But **there are no passwords anywhere in this system, on purpose** — a
fake password field would create false confidence without adding real security.
Signing in is presented honestly as "pick your name from the list," not a login.
This is accountability and workflow enforcement, not an access-control boundary.
**Do not deploy this publicly without adding real authentication first** — see
"Next steps" below.

Neither of these is a bug to be quietly patched over. They're documented,
deliberate scope boundaries from the prototype phase, now clearly labelled so
whoever continues this knows exactly what to build next and why it wasn't already
built.

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
│   │   │                        the export-to-HTML report builder, and the Fire Log /
│   │   │                        Window Restriction period-locking and frozen-snapshot logic.
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

## Styling & mobile

All CSS lives in `src/styles/global.css`, plain CSS with custom properties, no
build-time preprocessing. There's a single `@media (max-width: 780px)` block
handling phone-sized layouts (tables collapse to cards, forms stack to one column,
touch targets are sized up). This was verified by static CSS parsing and a real
`vite build`, but **not visually verified on an actual device** — the tooling used
to build this package does not render pages, so treat the mobile layout as
"should work, needs a real phone to confirm," not "confirmed."

## Known limitations / honest gaps

- No real authentication (see above).
- Attachments are base64-in-database by default; optionally offloaded to
  Cloudflare R2 when the `R2_*` env vars are set — see `server/README.md`
  "Attachments / object storage".
- A small Vitest suite (`npm test`) covers the pure functions in `src/lib/helpers.js`
  most worth protecting against silent regressions: date arithmetic (including the
  timezone bug described above), record status/due-date logic, and every form
  validator. It's a start, not full coverage — most of `helpers.js` (search, the
  Fire Log export machinery), the server routes, and the UI itself still have no
  automated tests. Testing beyond that suite has been: (a) a real `vite build`
  succeeding with zero errors, (b) the reference server's full CRUD cycle verified
  with real HTTP requests, (c) extensive interactive testing of the original
  single-file prototype before the split (every feature described
  in this README was built and manually tested at some point) — but the *split*
  itself has only been build-verified, not re-run through that full interactive
  test pass. Do that before trusting this deeply.
- Voice-note transcription depends on the Web Speech API, which is inconsistently
  supported across browsers (works in Chromium-based browsers, not reliably
  elsewhere). The audio recording itself is the reliable part; transcription is
  best-effort on top of it.

## Next steps, roughly in priority order

1. **Re-run a full interactive pass** on the split project (click through every
   register, every form, the correction-request workflow, sign-in) to confirm the
   split didn't silently change behaviour anywhere the build tool couldn't catch.
2. **Real authentication** on the server: password hashing (argon2/bcrypt) +
   sessions or JWTs, replacing the trust-everything reference server.
3. **Migrate the reference server from the `kv_store` table to `schema.sql`'s
   relational schema.** This is the biggest real piece of work left: rewriting the
   API routes to read/write normalized rows instead of JSON blobs, one entity type
   at a time. `useLedger.js` and the other hooks would keep working via the same
   `window.storage` contract as long as the API layer keeps translating.
4. **Object storage for attachments** (S3-compatible) instead of embedding
   base64 in JSON — `attachments.storage_url` in the schema already anticipates
   this.
5. Automated tests — there are none yet.
