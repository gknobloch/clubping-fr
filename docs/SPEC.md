# Table Tennis Availability Application

Your job is to develop a mobile-friendly web application allowing Table Tennis clubs to manage their players, teams, player availability for games and following who plays which games.

## General Instructions

* Although I'm prompting in English, the application should be localized in French.
* I'd like you to create an implementation plan so that we get to iterative progress.
* Modern look and feel.

### Technical

* Needs to be a web application
* Once validated locally, I would want to deploy to Cloudflare, including database and workers if needed
* Let's start with validating locally using mock data
* In development phase, I'd like to be able to login with any user without password (in dev, login field could be an auto-complete of all users)

## Profiles

The application has the following roles:
- *General Admin* - Who has ability to create/approve new clubs to use the application. There could eventually be multiple General Admins. A general admin is potentially a Club Admin, a Captain or Player of a club.
- *Club Admin* - Who has full control over his own club. There can be multiple admins per
  club, up to a maximum of 5, and never fewer than one once the club has any. A club
  admin is not necessarily a licensed player: a secretary or a president with no licence
  can administer the club.
- *Captain* - This special player is responsible for his team(s). There's only one captain per team.
- *Player* - A player is part of a club, and assigned to maximum one team per phase.

## Club

A club is identifiable by an identifier (user driven, it's the affiliation number) and a display name, e.g. 06680011 for "PPA Rixheim".

It also has multiple addresses where games can be played, one of them being the default.

### Onboarding a club

A club enters the application through one of two doors, and both end at the same
place: a General Admin decides.

- **On request.** Anyone — typically the club's FFTT correspondent — can ask for
  access from a public page, without an account, by giving the club's affiliation
  number. The FFTT club record is read live and shown back so both sides agree on
  which club is meant. The requester gives their name, e-mail and phone, may say
  who they are in the club, and may give their licence number. The request then
  takes two steps: **the club confirms, then a General Admin decides.**
- **Directly.** A General Admin creates the club and designates its first admin
  themselves, with no request and no waiting.

The club's step is a message to the address the FFTT publishes, carrying a link
that expires in seven days. Only once it is used does the request reach a
General Admin. Doing nothing refuses it: without the confirmation it goes no
further, so there is nothing to click to say no. A club for which the FFTT
publishes no address cannot confirm, and such a request goes straight to the
General Admin, marked as unconfirmable — a club with no listed contact must not
be a club nobody can ever join.

That middle step is a courtesy and a filter, **not a proof**. The address it is
sent to comes from the requester's own browser, so someone who submits their own
address as the club's will duly confirm their own request. What closes that is
the last step, unchanged: the General Admin re-reads the FFTT record and the
review screen compares the address actually written to against the one the
federation publishes now.

The FFTT club record publishes an official correspondent for the club — a name,
an e-mail and a phone. This is the evidence a General Admin weighs a request
against, not a credential: it is shown for comparison, and the correspondent is
never contacted by the application. A request whose e-mail differs from the
published one is perfectly ordinary and is not refused on that ground.

Approving a request creates the club if it does not exist yet, taking its name
and venue from the FFTT record, and makes the requester a Club Admin. Refusing
one keeps it, with the reason, rather than erasing it.

Four messages go out, and no others: the club is asked to confirm, the General
Admins are told once it has, and the decision reaches both the requester and the
club's address. Nobody is written to who did not either ask or get named by the
federation as the club's contact.

Approving a request that carries a **licence number** attaches the new admin to
that licence, as a player. Without it they are created as someone who does not
play — invisible to the player import, which matches on licence, so importing
the club's licensees would create the same person a second time. Where the
licence already belongs to someone, that member is promoted rather than
duplicated; where it belongs to another club's member, the request is refused
rather than moving them.

Two consequences of the correspondent being evidence rather than proof are worth
stating, because they are easy to get backwards:

- **The FFTT record shown on the public page is masked.** The address and phone
  the federation publishes are shown with most of their characters hidden —
  enough for a requester to recognise their own club, not enough to turn a page
  open to anyone into a directory of every club's contact details.
- **What the requester's browser read is part of their request, not a source.**
  The application cannot read the FFTT record itself, so the requester's browser
  does and submits what it saw. It is therefore theirs, and the reviewing admin
  is never shown a verdict computed from it: the comparison that decides
  anything is made against a fresh reading taken in the admin's own browser at
  the moment of the decision. The same applies to the club confirmation, which
  is sent to an address from that same reading.

Outside production, every message the application sends is diverted to a single
development address, carrying its intended recipient in a header and at the top
of the body. The onboarding flow writes to clubs, and a preview that could reach
one is a preview that can mail a real club by accident.

## Season
 
A season is something that only a General Admin can create.

It has a display name like "2025/2026" that identifies which years it overlaps (season is always lasting over 2 calendar years, usually starting in Fall and ending late Spring).

### Other
- A season can be archived
- There's only one active season

## Phase

A season is made out of 2 phases, Phase 1 and Phase 2.
Display name of a phase should contatenate the season name and the phase name - for instance "2025/2026 Phase 1".

Only Global Admin can create those phases.

### Other
- A phase can be archived
- There's only one active phase

## Match-day

A phase is made out of match-days. Default count is 7 (one less than amount of teams in the group).

## Division

In each phase, there's a list of divisions. Global Admin should be able to rank those divisions (from highest to lowest levels).

When creating a new phase, global admin should have a way to copy from previous phase.

A division has a display name, for instance "GE1".

The division will determine how many players per game are required.

## Group

A group is made of multiple teams, which might even be from the same club.

Usually, there are 8 teams but sometimes less. There will always be as many match-days as required to have each team of the group play against another team.
For instance
- 7 or 8 teams will result in 7 match-days
- 6 teams will result in 5 match-days

In each division, there could be multiple groups identified by a number, for instance Group 2 in division GE1.

## Team

A team has a number and is associated with a club and a phase, for instance "PPA Rixheim 1* is associated with "PPA Rixheim" club and Phase 1 of the "2025/2026" season.

A team also has
- A division that describes in which level it plays.
- A group that describes in which group of that division it plays
- A game location, to be picked by what has been defined in the club
- A default time for the games, for instance Thursdays at 8pm - this can eventually be overridden
- Number of players per game is inherited from the division it is part of
- One player of the team is designated the captain of the team
- An optional WhatsApp link

A team will have as many games as number of match-days in a season.

When there are less than 8 teams in the group, it could be that a team is exempted from a given match-day.

## Game

A game is opposing two teams (eventually from the same club) for a given match-day.

## Game Availability

For each game, every player will determine his availability.

## Player

A player has
- First name and last name
- A license number, e.g. 6814426
- An email (that will also be his acount identifier)
- A phone number
- A birth date (optional)
- A birth place (optional)

For each new phase, a player will have a locked amount of points, that will be valid for the entire season.

A player is either
- Active
- Pending Validation
- Archived

## Captain

One player of the team is promoted captain, he has the ability to decide which players of the team are selected for each game.

The captain can also override the values for availability of the players.

A player can only play in a single team for a given match-day.
Default list shows players of the team for game selection, but it's possible to take any active player from the club.

There are also rules determining if a player is allowed to play in a certain team. But we'll save this for later.

## Admin

### Club Admin

Each club has one or more admins that are able:
- To designate the other admins of their own club, up to 5 in total, choosing either
  a member of the club or anyone else by name and e-mail; and to stand one down,
  except the last one, since a club with no admin can no longer be administered by
  anyone. Standing an admin down leaves them a player of the club if that is what
  they were.
- To register teams in a phase / division / group - in case a global admin didn't create them
- To define the list of players of a team, which includes defining how many points that player has at the beginning of the phase, once assigned to that team
- To perform the actions of any captain of his club on any team of the club

### Global Admin

Global admin is able
- To create clubs, and to approve or refuse the requests of those asking to administer one
- To designate and stand down the admins of any club, under the same limit of 5
- To create divisions, phases, groups
- To create teams
