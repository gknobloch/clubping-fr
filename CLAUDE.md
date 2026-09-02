# Club Ping — Claude Code Project Guide

## Project overview
Mobile-friendly web app for managing table tennis club players, teams, availability, and match scheduling. French-language UI.

## Tech stack
- **Frontend:** React 18 + TypeScript 5.6 + Vite
- **Styling:** Tailwind CSS 3.4
- **State:** React Context (AuthContext, DataContext)
- **Routing:** React Router 6
- **Backend:** Cloudflare Pages Functions (Hono) + D1 (SQLite)
- **Unit tests:** Vitest + React Testing Library (happy-dom)
- **E2E tests:** Playwright (Chromium only)
- **CI:** GitHub Actions (build, lint, unit tests, E2E on PR/push to main)
- **Deploy:** Cloudflare Pages (auto-deploy on push to main)

## Key commands
- `npm run dev` — Start frontend dev server only (http://localhost:5173)
- `npm run dev:full` — Start full dev server with API + D1 (http://localhost:8788)
- `npm run build` — TypeScript check + Vite build
- `npm run lint` — ESLint
- `npm run test:run` — Unit tests (single run)
- `npm run test:e2e` — E2E tests (auto-starts dev server)
- `npm run test:coverage` — Unit tests with coverage
- `npm run db:migrate:local` — Run D1 migrations locally
- `npm run db:seed:local` — Seed local D1 database with mock data

## Project structure
- `src/pages/` — Page components
- `src/components/` — Reusable components (AppShell, ClubDetailView)
- `src/contexts/` — React contexts (Auth, Data)
- `src/mock/data.ts` — Mock data for tests and auth (users)
- `src/types/index.ts` — All TypeScript interfaces and enums
- `src/lib/` — Utilities (round-robin algorithm, brulage)
- `functions/api/` — Cloudflare Pages Functions (Hono API)
- `migrations/` — D1 SQL schema migrations
- `seed.sql` — Database seed data
- `e2e/` — Playwright E2E tests (two projects: `chromium` against `npm run dev`,
  and `pwa` against `vite preview`, since the service worker only exists in a build)
- `scripts/service-worker.js` — the PWA shell cache, built into `dist/sw.js` by
  `scripts/vite-plugin-service-worker.mjs` with the build's hashed file names
- `docs/SPEC.md` — Business specification
- `docs/IMPLEMENTATION_PLAN.md` — Phased roadmap with GitHub issues

## Path alias
`@` maps to `src/` (configured in both vite.config.ts and tsconfig.json)

## Data architecture
- **D1 (SQLite)** stores all persistent data (seasons, phases, clubs, teams, players, games, etc.)
- **Hono API** in `functions/api/[[path]].ts` handles CRUD operations
- **DataContext** fetches all data from `GET /api/data` on mount, updates state optimistically, and persists mutations via API calls in the background
- **DataContext** accepts `initialData` prop for tests (skips API fetch)
- JSON columns used for array fields (playerIds, teamIds, etc.) in D1

## Workflow rules
For any new feature or substantial change:
1. **Check for an existing GitHub issue** — search open/recently closed issues first
2. **Create an issue if none exists** — use it as the single tracking place
3. **Branch from issue** — e.g. `23-add-unit-and-e2e-tests`
4. **Never push directly to main** — all changes go through a PR from a feature branch
5. **Clean up after merge** — switch to main, pull, delete local and remote feature branches

Summary: Issue first → branch → implement → PR → merge → clean up branches.

## Conventions
- UI text must be in French
- Code comments and technical docs: English preferred
- All new features should include unit tests; user-facing flows should have E2E tests

### Offline (#387)
- Two caches, deliberately separate. **DataContext** owns the API response —
  keyed to the member and cleared at logout, because clubs share phones. The
  **service worker** owns the shell only and never touches `/api`; a second,
  unkeyed copy of the data there would outlive the session.
- The worker precaches the entry chunk and CSS, not dynamic imports: pdf.js and
  tesseract.js are ~2.6 MB for one admin flow.
- Cache lookups pass `ignoreVary: true`. Vite marks module scripts
  `crossorigin`, so they carry an `Origin` the precached copy lacks, and any
  server answering `Vary: Origin` otherwise makes every asset miss.

### Mobile UI
- **Page-header actions use `HeaderAction`** (`src/components/Button.tsx`) — icon
  only below `md:`, icon + label above. Their labels are long ("Importer depuis
  la FFTT" is 205px); two side by side push the header onto extra rows on a
  phone. Never add a bare text button to a `PageHeader`'s `actions`.
- **Row actions use `RowActions`** — the "…" menu, which is a bottom sheet. Pass
  `menuOnly` on cards so it is the menu at every width. Mark an action
  `desktopOnly` when it has no usable mobile form yet.
- Interactive targets are 44px below `md:`; the shared button classes already
  handle it. See `src/components/Button.tsx`.
- Dialogs go through `ModalShell`, which makes them bottom sheets below `sm:`.
  Never use `window.confirm` — it is silently inert on iOS Safari once a member
  blocks dialogs. Use `useConfirm` (#375).

### Competitions and player categories (#482)
- **A competition is global; a division belongs to one.** Never team →
  competition: a team already declares a division, and a championship is what a
  set of divisions is. `competitionOfDivision` is the only way to ask which
  competition a team plays in.
- **`Competition.categories` empty means EVERY category**, not none. It is what
  makes the senior championship expressible and an unconfigured competition
  harmless — read it through `categoryAdmitted`, never as a bare `.includes`.
- A club's overrides are exceptions to the global mapping, not a second list.
  `included` / `excluded`, and the third state is the **absence of a row**.
  A locked competition (`isCategoryLocked`) may only ever be narrowed by a club;
  the API refuses the widening, and `playerEligibility` refuses to honour a row
  that predates the lock.
- **Read a club's own overrides only** (`e.clubId === clubId`). `GET /api/data`
  carries every club's, and one club's exception must not decide another's list.
- The FFTT `<cat>` code is stored **verbatim** and normalised on read
  (`src/lib/playerCategories.ts`): youth suffixes drop (`B2` → `B`), veteran
  bands stay apart (`V50` ≠ `V60`).
- **The divisions import already knows its competition** and files them itself:
  it asks FFTT for one contest (`FFTT_CHAMPIONSHIP_CONTEST_IDENTIFIER`, "1" =
  the men's team championship). Keyed on the contest's *identifier*, never its
  id — FFTT issues a fresh id per (organisation, season), so the id would mint a
  new competition every August and orphan every category and derogation set
  against the old one. Re-importing fills a blank `competition_id`; it never
  overwrites a filing a general admin has made.
- It bites on what can be **added** — a team's roster picker, a line-up's
  "autres joueurs" — never on availabilities already given or line-ups already
  made. A competition edited after the fact must not empty a squad.

### Imports and pool changes (#422)
- Imports are additive by default: they create what is missing and never remove
  what disappeared. Removing what a rebuilt poule no longer holds is opt-in per
  import, counted in the preview first, and it takes the availabilities and
  compositions of the deleted matches with it.
- The comparison lives in `src/lib/poolChanges.ts`, shared by the FFTT and the
  document import. It only judges the journées the source itself covers:
  silence about a round is not a statement that its matches are gone.
- Never offered when an import is scoped to one team (#287) — that scope sees a
  slice of the calendar, so all the rest would read as obsolete.
- **A group's `teamIds` is the poule's composition**, not `team.groupId`: it is
  the list the imports prune when a team leaves. Read it wherever "who is in
  this poule" is the question (`gameEditOpponentOptions`, say).
- A team can change poule without being recreated — `PATCH /teams/:id` with a
  new `groupId` moves it, and its fixtures in the poule it leaves go with it.
  The phase never moves: team ids are derived from (club, phase, number) (#282).
