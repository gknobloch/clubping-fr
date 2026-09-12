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
- **A division may narrow its competition; the more specific wins.**
  `Division.categories` absent = inherit, `[]` = every category — three states,
  which is why the column is nullable and is read with an explicit null check
  (`jsonParseCategories(null)` is `[]`, i.e. "everyone", not "inherit"). Never
  read `competition.categories` for a team: `competitionOfDivision` returns the
  competition already narrowed, keeping its id and lock so club derogations
  still hang off the championship.
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
- **A category belongs to a season, not to the licensee** (0050): keyed
  `(season_id, player_id)`, exactly as points are keyed `(phase_id, player_id)`
  — one grain up, because nobody changes category at a phase boundary. One
  field on `users` would have let each August's import overwrite the value that
  decided last season's eligibility. `User.category` no longer exists; screens
  resolve through `src/lib/seasonCategories.ts`, and everything unqualified
  means the **active** season (`activeSeasonId`), since eligibility is a
  question about now.
- Clearing the field **deletes the row**. "We do not know" is the absence of a
  category, not an empty one — an empty string would read as a code we simply
  do not recognise.

### Licence non validée (#488)
- The club import already computed "Absents de la liste FFTT" and threw it away
  on close. It is now recorded per season in `player_season_licences`: **a row
  means the federation listed that licence**, nothing more.
- The absence of a row is **two different things** — not listed, or never
  imported — so nothing reads the table directly. `src/lib/seasonLicences.ts`
  answers per club, and only for a club holding at least one row for the season,
  which is what proves an import ran. Tagging a whole club because nobody
  pressed a button would be worse than saying nothing.
- Only the **club-wide** import writes it, and it **replaces** the club's set for
  that season. Looking a single licence up says nothing about the rest of the
  club and must not empty it.
- It is written when the listing is fetched, not when the fields are applied:
  who holds a licence is a fact about FFTT's answer, not about which checkboxes
  an admin ticked.
- It **never filters and never blocks** — an unvalidated licence is usually a
  renewal in flight. The tag rides next to the name, and the line-up names
  whoever is picked, on web and mobile alike.
- Warning **while composing is not enough**: nobody reopens the sheet to check,
  so the match screen itself carries it too, on the line-up already saved. That
  is the screen a captain lands on the morning of the match.
- It rides with the **name**, wherever a name is listed: the journées matrix and
  its "autres joueurs", a match's roster and its quick view, a team's squad, the
  player sheet — web and app alike. `unlicensedIds` is the one derivation; never
  re-answer it at a call site.
- In the **matrix** the marker goes on the licence line, not beside the name:
  that line is already about the licence, and the name column is the one column
  the matrix cannot afford to widen. The feuille de match is left alone — it
  mirrors FFTT's own sheet.
- **The mobile app reads both per-season tables** (#482's category, this one),
  which is the first time it has carried either; `withDefaults` fills them in
  for an offline cache written before they existed.
- **A competition is FFTT data, imported like everything else.** The `contests`
  query without its `identifier` filter lists an organisation's championships;
  `/competitions` imports from that, and the manual add is the fallback for what
  FFTT does not run. Never make typing one in the primary path.
- **A competition is matched on its contest identifier; the FFTT name only
  disambiguates.** `findCompetitionForContest` is the one place: exact
  (identifier, name) wins; failing that, a single stored row under that
  identifier is *adopted and its stale name corrected*, but only when FFTT's
  listing also shows one contest under it. Both halves of that guard are
  load-bearing — without the first a renamed competition duplicates itself
  (migration 0049), without the second importing FFTT's two `TO` contests in one
  batch fuses them.
- The id is per-season (18368 vs 15954 for the same championship), so keying on
  it would mint a new competition every August and orphan every category and
  derogation. The identifier alone is not unique either: org 15 lists `TO` twice
  in one season. `fftt_contest_name` is kept apart from `display_name` so a
  rename cannot break the match — **never backfill one from the other**, which
  is exactly what 0048 got wrong.
- **A request names a contest by its FFTT id**, resolved out of the listing in
  JavaScript. Never re-add an `identifier:` filter to the `contests` query: it
  would silently return whichever of two contests came first. Nothing from a
  request reaches a GraphQL string literal any more.
- **The divisions import knows its competition** and files its divisions itself.
  Re-importing fills a blank `competition_id`; it never overwrites a filing a
  general admin has made.
- It bites on what can be **added** — a team's roster picker, a line-up's
  "autres joueurs" — never on availabilities already given or line-ups already
  made. A competition edited after the fact must not empty a squad.
- That rule is what makes editing safe and also what makes it quiet, so the
  contradiction has to be **visible**: `src/lib/competitionAssignments.ts`
  answers "who does this competition already field?", the screens flag a ⚠ on
  any *ineligible* licensee an équipe still holds, and every exclusion of one
  goes through `useConfirm` first. The wording states the fact, never a
  consequence — nothing is undone, so "sera retiré" would be a lie.
- A team belongs to a competition **through its division**, so the assignment
  scan reads `competitionOfDivision`, and it is computed once per competition,
  not once per cell.
- The grid's selection only ever means **what is on screen**: narrowing the
  category filter drops the rows it hides out of the selection, or a bulk
  action reaches players the club is no longer looking at.
- **Every filter lives in the header of the column it narrows** — the name, the
  category (its own column since the grid grew), and each competition's status
  multi-select. They compound: two columns filtered is an AND, the statuses
  within one column an OR.
- `CellStatus` is the five verdicts **plus `conflict`**, which is not a verdict
  at all — it is the ⚠ pairing, and "show me the contradictions" is a question
  no reason answers on its own.
- The status popover is `position: fixed` off its trigger's rect. The grid
  scrolls sideways and `overflow-x-auto` clips both axes, so an absolutely
  positioned panel is cut off at the first row.
- The rule behind a column goes behind an **ⓘ**, never into the header: a club
  admin reads it once, and `CompetitionInfo` spells the categories out in full
  rather than reusing the admin table's compact codes.
- A bulk action applies only to the selected players it would actually change
  (`eligibilityCell(...).action` decides), which is why each button carries its
  own count and why "Ajouter" reads 0 on a locked competition.
- **`/competitions` is two screens behind one route.** A general admin gets the
  global configuration (import, categories, the lock); anyone else gets their
  own club's amendments. A club's eligibility is not part of its identity card,
  so it is no longer a section at the bottom of `/club`.
- **The club's screen is the journées trade**: the grid above `md:`, where the
  question is comparative ("who is missing from the youth championship?"), and
  `ClubCompetitions` — one competition at a time — below it. Forty rows by five
  columns is not a phone screen.
- One computation feeds the grid, the list and the player page:
  `eligibilityCell` returns the verdict *and* the action offered
  (`exclude` / `include` / `reset` / `none`). Never re-derive "can this be
  clicked?" at a call site — `none` is exactly the locked competition a club may
  not widen, and it must read the same everywhere.
- **There are four ways to field somebody, and all four ask**: the roster picker
  (`TeamsPage`), the match sheet (`MatchDayDetailPage`), the accueil's next-match
  sheet, and the **journées matrix** — whose compo dropdown offers no team the
  competition refuses, and whose "Autres joueurs du club" lists nobody no team
  could field. The bite is always on what can be *added*: a team its roster
  already holds stays on the list, and so does one a line-up already names.
- **`teamEligibility(teams, ctx)` is that rule, and the only copy of it.** A
  factory, not a bare function, because a team reaches its competition through
  its division — two lookups — and every caller asks it of a whole club against
  every team. `admits` is the competition's verdict; `mayField` is what a picker
  offers, which is `admits` OR a roster that already holds them. Never rebuild
  the pair at a call site.
- **The mobile app asks the same question** (#498): the journées matrix, the
  captain's line-up sheet and the roster picker all go through
  `@shared/lib/competitionEligibility`, so the verdict cannot depend on which
  screen you are holding. `competitions` and `competitionEligibilities` ride in
  its `DataState`, and `withDefaults` empties them for a cache written before
  #498 — which restricts nobody, the right answer for a payload that never
  carried the tables.
- **`EligiblePlayer.category` is required, and may be undefined.** A licensee
  carries no category of their own, so it has to be resolved
  (`withSeasonCategory`, the active season) before the rule is called. When the
  field was optional a raw `User` satisfied the shape, every screen that forgot
  read "sans catégorie", and a competition naming its categories admitted nobody
  at all — silently, because the empty-list case (the senior championship) is
  the one that still worked. Never loosen it back.

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

### Import from a file (#260, #486)
- **One FFTT export holds every poule of a division**, one page each (the real
  "GE 7 phase 1" file holds poules 42 to 45). The extracted lines are cut into
  one section per "… Poule N" header (`splitScheduleDocumentSections`) and each
  section becomes its own import row with its own division/group mapping.
  Parsing a whole file as one poule stacks four calendars into the first one.
- pdf.js comes from `pdfjs-dist/legacy/build/`, and not for old browsers: the
  default build calls `Map.prototype.getOrInsertComputed`, which Chrome 141 does
  not have, so rendering a page throws there. Only the legacy build polyfills it.
- **Never `for await` over a stream here**, and never call pdfjs's
  `getTextContent()`, which does: WebKit has no async iteration over a
  `ReadableStream` (webkit.org/b/194379), so on an iPhone that call threw before
  a single line came back and every text-layer PDF was refused. `readTextItems()`
  reads the same `streamTextContent()` stream with a reader. An E2E test deletes
  `ReadableStream.prototype[Symbol.asyncIterator]` to hold this.
- **OCR never sees a PDF.** `createImageBitmap` decodes images, not documents,
  and throws on one. A PDF with no text layer goes through
  `renderPdfPages` first — that is the whole scanned-calendar path.

### Notifications push (#495)
- **Un registre d'envois, pas un calcul de date.** La règle n'est pas « les
  matchs qui sont à J-7 aujourd'hui » mais « qui, dans l'effectif d'un match à
  moins de 7 jours, n'a pas encore été prévenu ? ». La première formulation ne
  voit pas le joueur ajouté à l'effectif à J-3 — le seul que personne n'a
  prévenu — et exige donc un second déclencheur sur les effectifs, qui doit
  ensuite s'accorder avec le premier sur ce qui est déjà parti.
  `notifications_sent`, clé `(kind, user_id, game_id)`, répond aux deux avec un
  seul balayage, et rend le cron rejouable : deux exécutions n'envoient rien
  deux fois.
- Rien n'est inscrit au registre pour quelqu'un **sans appareil ou qui a coupé
  les notifications**. L'inscrire voudrait dire qu'installer l'app le jeudi ne
  ramène plus la demande pour le match de samedi.
- **Le déclencheur est un workflow GitHub**, pas Cloudflare : les Pages
  Functions n'ont pas de cron trigger. `POST /api/notifications/dispatch`
  s'authentifie avec `NOTIFY_SECRET`, et **un environnement sans ce secret
  répond 404** — pas 401. Une preview n'admet donc même pas que la route
  existe. C'est aussi pour ça que la route est dans `needsSession` : elle porte
  sa propre preuve, plutôt qu'une session de 30 jours créée pour un cron.
- **Le ping capitaine part de `POST /game-availabilities/set`**, le seul
  endroit qui voit l'ancienne réponse à côté de la nouvelle — web et mobile y
  passent tous les deux. Il ne se déclenche **que sur un changement**, jamais
  sur une première réponse : remplir la grille est le retour attendu du rappel
  quotidien, et un capitaine notifié une fois par coéquipier le soir du rappel
  ne lit plus la neuvième, celle qui dit qu'il manque quelqu'un.
- **L'auteur du changement n'est jamais notifié.** Cela couvre le capitaine qui
  force la dispo de quelqu'un depuis la composition, sans que `captainsToAlert`
  ait à savoir si l'écriture est un override ou non.
- **Le message dit si la composition nomme déjà l'intéressé**, parce que c'est
  la différence entre « je trouverai quelqu'un » et « la feuille que j'ai
  rendue est fausse » — la seule chose que le capitaine lit la notification
  pour savoir. Énoncé comme un fait, jamais comme une conséquence : un
  changement de dispo ne défait rien, la composition nomme toujours qui elle
  nomme, donc « sera remplacé » serait un mensonge (même raison qu'en #482).
  Dit dans les deux sens, y compris un retour à disponible : ne le dire que
  quand ça empire supposerait un ordre entre les trois statuts qui n'existe
  nulle part ailleurs dans l'app.
- Pas de pronom dans ce texte : le français oblige à en choisir un, et on ne
  sait rien du genre du licencié. « Figure dans la composition » s'en passe.
- La notification ne porte **pas d'équipe**, seulement `gameId` : l'écran de
  match est la vue d'**une** équipe sur une rencontre, et la bonne équipe est
  celle dont l'effectif contient celui qui tape — réponse différente pour le
  joueur et pour son capitaine, et résolue à l'ouverture plutôt que figée dans
  une charge utile écrite une semaine plus tôt.
- **`push_tokens` est clé sur le token, pas sur (membre, token)** : un
  téléphone de club repris par le capitaine suivant réenregistre le *même*
  token sous un autre membre, et seul le remplacement de la ligne le déplace.
  Sinon l'ancien porteur continue de recevoir les matchs du club.
- Le token est **écrit dans AsyncStorage avant d'être envoyé**. La
  déconnexion est le moment où `getExpoPushTokenAsync` a le moins de chances de
  répondre, et un token qu'on ne sait plus nommer est un token qu'on ne peut
  plus faire oublier — donc un téléphone déconnecté qui sonne encore.
- **L'anonymisation de la base dev supprime `push_tokens`**, au même titre que
  les sessions. Pire qu'une session, même : une session copiée laisse *lire* une
  preview, un token de push laisse une preview *écrire* sur l'écran verrouillé
  d'un vrai licencié.
- L'icône Android est une **silhouette** : Android ignore les couleurs et ne
  garde que le canal alpha. `notification-icon.svg` est donc dessinée comme un
  masque — la balle et la fente entre les raquettes sont des trous, sans quoi
  la marque se réduit à une tache. Lui passer `icon.png` donne le carré blanc.
- Les règles (fenêtre, destinataires, textes) sont dans
  `src/lib/pushNotifications.ts`, sans base ni réseau ; `functions/api/push.ts`
  est le transport Expo, et le seul à savoir purger un token qu'Expo déclare
  mort — personne d'autre ne le remarquera jamais.
