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
