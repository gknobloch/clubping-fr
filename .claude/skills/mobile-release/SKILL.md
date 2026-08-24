---
name: mobile-release
description: Release the Club Ping mobile app to the App Store and Google Play — work out whether the changes since the last shipped build make it a major, minor or patch release, confirm the version number, bump the metadata through a PR, and run the EAS builds with auto-submit. Use this whenever the user wants to ship, release, publish, or cut a version of the mobile app, says things like "release 1.2.0", "ship the app", "new version on both stores", "push a build to TestFlight", "submit to Play", or asks what the next version number should be — even when they name the version themselves, since the analysis and the bump still have to happen.
---

# Mobile release

One version number covers both stores. A release is four steps: work out what is
actually shipping, agree on the number, bump it through a PR, then build and
submit. The deep material — credentials, store listing, the Play service
account, the native-config traps — lives in `mobile/DISTRIBUTION.md`; read it
when something in step 4 goes wrong rather than duplicating it here.

## 1. Find what is actually shipping

The baseline is not "the last version bump commit" — it is the commit that was
last *built*. Ask EAS:

```bash
cd mobile && eas build:list --limit 10 --non-interactive
```

Each entry carries a `Commit` and a `Platform`. Take the newest **finished**
`production` build for each platform. If the two disagree, use the older one:
the version number covers both, so the release has to account for everything
neither store has yet.

Then list what changed since — but only what reaches the binary:

```bash
git log --oneline <baseline-sha>..HEAD -- mobile src/lib src/types
```

`mobile/` is the app. `src/lib` and `src/types` are in there too, because
`mobile/babel.config.js` aliases `@shared/lib` and `@shared/types` at them — a
change to `src/lib/` ships inside the app even though it lives in the web tree.

Everything else does not reach the binary: `src/pages`, `src/components`,
`functions/`, `migrations/`, `e2e/`, the docs, and the Play listing assets under
`mobile/assets/store/`. A commit that only touches those changes what a member
sees on the web, not what is installed on their phone.

**If nothing touches the binary, stop and say so.** A release with no binary
change still costs an App Store review and asks every tester to download the
same app again. Let the user decide whether it is worth it.

## 2. Decide major, minor or patch

Judge by what a **member notices**, not by the size of the diff. A 400-line
refactor that changes nothing on screen is a patch; a 12-line change that puts a
new control in front of people is a minor.

- **patch** (1.1.2 → 1.1.3) — fixes, wording, layout, performance, a filter that
  narrows a list that was already there. Nothing a member has to learn.
- **minor** (1.1.3 → 1.2.0) — a member can now do something they could not
  before: a new screen, a new tab, a capability that did not exist.
- **major** (1.x → 2.0.0) — reserved. Nothing in a club app forces one on its
  own; it would take a reshaped navigation, a change that signs everybody out,
  or dropping an OS version. **Never pick it unaided.** If the changes look
  major, say why and let the user make that call.

Read the commit bodies, not just the subjects — this repo writes them in French
and they explain the intent, which is exactly what the judgement needs.

## 3. Confirm the number

Use `AskUserQuestion`. Offer the deduced bump first, labelled *(Recommandé)*,
with the adjacent options beside it — the user may know about something that has
not landed yet, or may want to hold a feature back.

Before the question, show your reasoning in a couple of lines: the baseline
build, what changed, and why that reads as patch or minor. The question is cheap
to answer when the analysis is already on screen.

## 4. Bump the metadata

Through a PR — `CLAUDE.md` applies to the release like anything else: issue
first, branch from it, never push to `main`. The issue is worth writing properly:
it is where the release notes live for whoever looks back at this version.

Two files, one command each, from `mobile/`:

```bash
npm version <new-version> --no-git-tag-version
```

That covers `mobile/package.json` and `mobile/package-lock.json`. Then set
`expo.version` in `mobile/app.json` to the same string.

**Leave `versionCode` and `buildNumber` alone.** `eas.json` sets
`appVersionSource: "remote"`, so EAS owns them and increments each on its own at
build time. Writing them by hand puts the repo and EAS out of step, and the
store rejects the collision much later, when the build has already been made.

Open the PR, let CI go green, squash-merge, delete the branch, prune. Build from
`main` — the build records the commit it came from, and a build off a branch
leaves the trail pointing somewhere that no longer exists.

### If the release changes native config

Anything in `mobile/app.json` beyond the version, or anything in
`mobile/plugins/`, decides what lands in `Info.plist`, the entitlements and
`AndroidManifest.xml`. Nothing in CI reads any of it — no test, no typecheck, no
linter — so a mistake there is invisible until an installed build launches. 1.1.0
shipped to the App Store and crashed on every launch for exactly this (#420).

Print what the change actually generates before shipping it:

```bash
npx expo config --type introspect
```

`mobile/DISTRIBUTION.md` has the specific traps, including why an iOS usage
string must never be deleted to "not ask for" a permission.

## 5. Build and submit

From `mobile/`, one command per platform:

```bash
eas build --platform ios --profile production --auto-submit --non-interactive
```

```bash
eas build --platform android --profile production --auto-submit --non-interactive
```

Run them in the background and in parallel — they are independent cloud builds
and each takes anywhere from five minutes to half an hour. Report the build
number and versionCode EAS assigns as it starts, so the user can follow along on
expo.dev.

**`--auto-submit`, never `npm run submit:ios` / `submit:android`.** Those scripts
pass `--latest`, which means "the most recent production build" and not "the one
we just made" — after any build that did not reach the store, they retry a
version the store has already seen and are rejected for it. `--auto-submit`
submits the artifact it just produced.

`--non-interactive` works because the credentials already live on the EAS
servers: the iOS distribution certificate and App Store Connect API key, the
Android upload keystore, and `mobile/google-play-service-account.json` for the
Play upload. If a credential prompt does block a build, that is the one case
`DISTRIBUTION.md` means about needing a real terminal — hand it back to the user
rather than trying to fake a TTY.

### Where the builds land

Neither goes straight to the public. iOS arrives in App Store Connect for
TestFlight and review; Android lands on the Play `internal` track, set by
`eas.json`. **Promotion to production is manual, from each console** — say this
plainly when reporting, so nobody thinks the release is live when it is not.

## Reporting

When both finish, give the user the version, the iOS build number, the Android
versionCode, the submission links, and what is left for them to do by hand. If
one platform fails and the other succeeds, say so and keep the successful one —
they are separate releases that happen to share a number.
