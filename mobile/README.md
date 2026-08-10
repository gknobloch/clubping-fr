# Club Ping — Mobile (Expo)

Native iOS and Android app built with Expo and expo-router. Uses the same Cloudflare Pages API as the web app.

## Prerequisites

- Node.js 20+
- Expo CLI: `npm install -g expo-cli` (or use `npx expo`)
- For iOS: Xcode 15+ (Mac only)
- For Android: Android Studio with an emulator, or a physical device with Expo Go

## Setup

```bash
cd mobile
npm install
```

## Running

**Start the dev server (with Expo Go):**

```bash
npm start
```

> The app talks to the **production** API (`https://clubping.fr`) by default — see
> `constants/api.ts`. To develop against a local backend, run `npm run dev:full`
> from the **project root** and set `EXPO_PUBLIC_API_URL` (see [Environment](#environment)).

**iOS simulator:**
```bash
npm run ios
```

**Android emulator:**
```bash
npm run android
```

## Tests

Unit tests run on [jest-expo](https://docs.expo.dev/develop/unit-testing/), separately from the web app's Vitest suite (own config, own `node_modules`). Both `npm run typecheck` and `npm run test:run` run on every PR.

```bash
npm run test:run   # single run (what CI runs)
npm test           # watch mode
```

Tests live next to the code they cover (`utils/offlineCache.test.ts`, `contexts/DataContext.test.tsx`). `@react-native-async-storage/async-storage` is replaced by its official in-memory mock in `jest.setup.js`.

## Environment

| Variable | Default | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `https://clubping.fr` | Override the API base URL (local backend, preview deployment) |
| `EXPO_PUBLIC_DEV_LOGIN` | unset | Force the dev "pick any user" login in a release build |

Set them in `mobile/.env` (git-ignored):
```
EXPO_PUBLIC_API_URL=http://localhost:8788
```

Two things to know about `EXPO_PUBLIC_*`:

- The values are **inlined into the JS bundle at build time**, so changing `.env`
  requires restarting Metro (`npx expo start --clear`) or rebuilding — an already
  installed app keeps whatever it was built with.
- They are **public**: they ship inside the binary. No secrets here.

On a physical device `localhost` is the phone itself, so use your machine's LAN
IP (e.g. `http://192.168.1.20:8788`); `localhost` only works on the iOS simulator.

## Installing on a real phone

Running from Xcode (or `npm run ios`) builds the **Debug** configuration, which
does **not** embed the JS bundle — it downloads it from the Metro dev server on
your Mac at every launch. That build stops working the moment the phone leaves
your machine: it appears to be "looking for a local server", because it is.

For a build that runs standalone against production:

```bash
npm run ios:prod        # expo run:ios --configuration Release --device
npm run android:prod    # expo run:android --variant release
```

Release embeds the bundle, and `constants/api.ts` already defaults to
`https://clubping.fr`. From Xcode the equivalent is
**Product → Scheme → Edit Scheme → Run → Build Configuration = `Release`**.

Caveats for a local iOS Release build: the device needs real code signing
(**Signing & Capabilities → Team**). A free Apple ID works, but the app expires
after 7 days. For anything you intend to keep installed, use EAS Build below.

### Login when targeting production

`AuthContext.tsx` disables the dev "pick any user" login whenever the app points
at a deployed backend — the API rejects sessionless dev logins, so it could only
mislead. A production-pointed build needs real auth:

- **Email OTP** — only actually sends mail if `RESEND_API_KEY` is set on the
  deployment; otherwise the backend returns the code as `devCode`.
- **Apple Sign-In** — works (audience is the bundle id `fr.clubping.app`).
- **Google on iOS** — not configured: `app.json → expo.extra.googleIosClientId`
  is still empty.

In every case the email must already match a `users` row, or the API answers
`403 no_account`. See [`../docs/AUTH_SETUP.md`](../docs/AUTH_SETUP.md).

## Project structure

```
mobile/
├── app/
│   ├── _layout.tsx          # Root layout — DataProvider + AuthProvider + auth guard
│   ├── login.tsx            # User selector (mock auth, matches web)
│   └── (tabs)/
│       ├── _layout.tsx      # Bottom tab bar
│       ├── index.tsx        # Accueil
│       ├── journees/        # Match days list + game detail (availability + selection)
│       ├── equipes/         # Teams list + team detail
│       ├── joueurs/         # Players list + player detail
├── contexts/
│   ├── AuthContext.tsx      # Auth (AsyncStorage — mirrors web localStorage auth)
│   └── DataContext.tsx      # Data fetching from /api/data
├── constants/
│   ├── api.ts               # API base URL helper
│   └── colors.ts            # Design tokens (mirrors Tailwind slate/blue palette)
└── utils/
    └── roles.ts             # Role helpers (canManageTeam, canManageClub, labels)
```

## Shared types

TypeScript types are shared directly from `../src/types/index.ts` via `@shared/types` path alias — no duplication.

## Building for production (EAS Build)

[EAS Build](https://docs.expo.dev/build/introduction/) builds in the cloud, so it
needs no Mac and produces properly signed binaries. Profiles live in `eas.json`:

| Profile | API URL | Use for |
|---|---|---|
| `development` | from your local `.env` | Dev client — JS still comes from your Metro server |
| `preview` | `https://clubping.fr` | Standalone build to install on your own device (ad-hoc / APK) |
| `production` | `https://clubping.fr` | Store submission (App Store / Play Store) |

```bash
npx eas login
npx eas build:configure          # first time only — links the project
npx eas build --platform ios --profile preview
npx eas build --platform android --profile preview
```

`preview` is what you want to install Club Ping on your own phone: it is a
standalone build wired to production, with no Metro server involved. EAS prints a
QR code / install link when the build finishes.

Both `preview` and `production` pin `EXPO_PUBLIC_API_URL=https://clubping.fr` in
`eas.json`, so the deployed backend is used regardless of any local `.env`.
