# Implementation plan

This doc maps the SPEC to a phased plan. Each row links to a GitHub issue; use one branch per issue and never push directly to main (see the workflow rules in [CLAUDE.md](../CLAUDE.md)).

---

## Phases and issues

Status of each item can be seen from the linked GitHub issue.

| # | Description |
|---|-------------|
| [**#2**](https://github.com/gknobloch/clubping-fr/issues/2) | **Initial app (Phase 0+)** — Vite + React + TypeScript + Tailwind, French UI, dev login (user autocomplete, no password), mock data. General Admin: CRUD for clubs, seasons, phases, divisions, groups, teams; division reorder. Club Admin: club context in header and home, teams filtered by club, Joueurs page (list/add/edit players). |
| [**#4**](https://github.com/gknobloch/clubping-fr/issues/4) | **Match-days and games** — Match-days per group (phase → group → journées). Manual create/edit match-days (number, date) and games (home/away). Teams restricted to group; no duplicate team per match-day. Journées page with list/view. |
| [**#5**](https://github.com/gknobloch/clubping-fr/issues/5) | **Game availability** — Per game, each player of the team can set availability. Captain (and Club Admin) can override. Enforce “one player per team per match-day” in UI/API. Captain/Player nav and club-scoped data; availability 3 states; opponent roster hidden. |
| [**#6**](https://github.com/gknobloch/clubping-fr/issues/6) | **Captain: game selection** — For each game, captain picks which players actually play (from team roster; later: from club active players with rules). Default list from team. |
| [**#7**](https://github.com/gknobloch/clubping-fr/issues/7) | **Persist data (replace mock)** — Replace in-memory mock with real storage (e.g. D1 or KV on Cloudflare; or SQLite locally then D1). Expose same operations via API or context. |
| [**#8**](https://github.com/gknobloch/clubping-fr/issues/8) | **Auth (replace dev login)** — Replace “login as any user” with real auth (e.g. Cloudflare Access, or OAuth / magic link). Store user/club/role in DB. |
| [**#9**](https://github.com/gknobloch/clubping-fr/issues/9) | **Deploy to Cloudflare** — Frontend on Pages (or Workers); API on Workers; D1/KV bound. Env config for prod. |
| [**#10**](https://github.com/gknobloch/clubping-fr/issues/10) | **Player–team assignment and points** — Per phase: assign player to at most one team; set “locked” points for the phase. Club Admin: define team roster and initial points. |
| [**#11**](https://github.com/gknobloch/clubping-fr/issues/11) | **Club addresses CRUD** — Add/edit/delete addresses for a club; set default address. Used for team game location. |
| [**#12**](https://github.com/gknobloch/clubping-fr/issues/12) | **Rules for player eligibility** — Rules determining if a player is allowed to play in a certain team. Defer to later; optional. |
| [**#13**](https://github.com/gknobloch/clubping-fr/issues/13) | **UX and i18n pass** — Consistent French copy, mobile-friendly layout, accessibility. Optional/polish. |
| [**#14**](https://github.com/gknobloch/clubping-fr/issues/14) | **Delete for entities** — Add “Supprimer” (and confirmation) for clubs, seasons, phases, divisions, groups, teams, players where spec allows. Optional/polish. |
| [**#15**](https://github.com/gknobloch/clubping-fr/issues/15) | **Copy divisions from previous phase** — When creating a new phase, “copy from previous phase” for divisions (and optionally groups). Optional/polish. |

---

## Since Phase 0

The table above is the original Phase 0 roadmap and stops at #15; the work since
then is tracked in the issues themselves rather than restated here. Only items
whose shape is worth reading before the code exists are listed below.

| # | Description |
|---|-------------|
| [**#482**](https://github.com/gknobloch/clubping-fr/issues/482) | **Player categories and competition eligibility** — A competition is a global entity a division belongs to, carrying the categories it admits by default; a club amends that mapping for its own licensees, and a locked competition may only ever be narrowed, never widened. The category itself comes from the FFTT licence (`<cat>`), stored verbatim and normalised on read. A licensee is eligible to as many competitions as the mapping allows — a cadet plays in their own category and with the adults. A division belonging to no competition restricts nobody, which is what every division is until a General Admin says otherwise. See [SPEC](SPEC.md#competition). |
| [**#474**](https://github.com/gknobloch/clubping-fr/issues/474) | **Club onboarding and club admins** — Up to 5 admins per club, never zero, not necessarily licensed players, managed from the club sheet. Two ways in: a public request at `/rejoindre` from anyone holding an affiliation number, or direct creation by a General Admin. A request is confirmed by the club at `/confirmer-demande` (a link e-mailed to the address FFTT publishes) before reaching `/demandes`, where it is approved or refused against a live re-reading of the FFTT record taken in the reviewing admin's own browser — neither the requester's own reading nor their club confirmation is treated as proof. An optional licence number attaches the new admin to the licensee they already are, instead of a second fiche the player import then duplicates. Outside production every e-mail is diverted to one dev address. See [SPEC](SPEC.md#onboarding-a-club). |

---

## Workflow reminder

- Before starting a new feature: find or create the GitHub issue, then create a branch from that issue (e.g. `4-match-days`, `issue/5-availability`).
- All merges to `main` via Pull Request; no direct push to `main`.
- After a PR is merged: switch to `main`, pull, and delete the local and remote feature branches.
