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

> The mobile app calls `http://localhost:8788/api/...` by default.  
> Run `npm run dev:full` from the **project root** first to start the API + D1 local server.

**iOS simulator:**
```bash
npm run ios
```

**Android emulator:**
```bash
npm run android
```

## Environment

| Variable | Default | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:8788` | Override API base URL (e.g. for staging/prod) |

Set it in `mobile/.env`:
```
EXPO_PUBLIC_API_URL=https://clubping.fr
```

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

## Building for production

Use [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
npx eas build --platform ios
npx eas build --platform android
```

Set `EXPO_PUBLIC_API_URL` in your EAS build profile (`eas.json`).
