# Auth provider setup (issue #100)

The auth **code** (web, mobile, backend) is already built — it just needs
credentials. This guide lists every account to create, every value to obtain,
and exactly where each value goes. None of it requires changing source code.

## How auth works (why this matters for setup)

- **Email OTP** — the backend generates a 6-digit code and sends it with
  [Resend](https://resend.com). `RESEND_API_KEY` is the **only true secret** in
  the whole system. Without it, the backend logs the code and returns it as
  `devCode` instead of emailing it.
- **Google / Apple** — the client (web or mobile) obtains a signed **OIDC
  ID token** from the provider and sends it to `POST /api/auth/oauth`. The
  backend verifies the token's signature against the provider's public JWKS and
  checks its `aud` (audience) against an allow-list. We never do the
  authorization-code exchange, so **no Google or Apple client secret / private
  key is needed.** The OAuth client ids are **public** config.

So there is exactly one secret (`RESEND_API_KEY`); everything else is public
identifiers that can live in plain env vars / committed config.

In all cases a successful login maps to a `users` row **by email** — an email
with no `users` row gets `403 no_account` (see issue #101).

---

## A. Resend (email OTP)

1. Create a Resend account and **verify a sending domain** (Domains → Add).
2. Create an API key (API Keys → Create). Copy it.
3. Set:
   - `RESEND_API_KEY` = the key — **secret**.
   - `RESEND_FROM` = a sender on the verified domain, e.g.
     `Club Ping <no-reply@yourdomain.fr>`.

> Resend's shared `onboarding@resend.dev` sender only delivers to the Resend
> account owner's own address — fine for a first smoke test, not for real users.

**Verify:** with the key set, `POST /api/auth/email/request` stops returning
`devCode` and a real email arrives.

---

## B. Google OAuth

In the [Google Cloud Console](https://console.cloud.google.com/) → APIs &
Services → Credentials, configure the OAuth consent screen, then create **OAuth
client IDs** (one per platform you ship):

| Platform | Client type | Extra config |
| --- | --- | --- |
| Web | "Web application" | Authorized JavaScript origins: your web origin(s) — `https://clubping.fr`, `https://clubping-fr.pages.dev`, `http://localhost:8788` |
| iOS | "iOS" | Bundle ID `fr.clubping.app` |
| Android | "Android" | Package `fr.clubping.app` + SHA-1 |

Then place the ids:

- **Web** → `VITE_GOOGLE_CLIENT_ID` (web `.env.local` / Pages build var).
- **iOS / Android** → `mobile/app.json` → `expo.extra.googleIosClientId` /
  `googleAndroidClientId` (and `googleWebClientId` for Expo's web/proxy flow).
- **Backend** → `GOOGLE_CLIENT_IDS` = **comma-separated list of ALL** of the
  above ids (the backend accepts a token whose `aud` matches any of them).

---

## C. Apple OAuth ("Sign in with Apple")

In the [Apple Developer](https://developer.apple.com/account/resources) portal:

1. **App ID** `fr.clubping.app` → enable the *Sign In with Apple* capability
   (used by the native iOS app; its id_token `aud` is the **bundle id**).
2. **Service ID** (Identifiers → Services IDs), e.g. `fr.clubping.web` →
   enable Sign In with Apple, and add the web domain `clubping.fr` +
   **Return URL** (`https://clubping.fr/login`). This is the **web** client id.
3. (No key needed — we only verify the id_token, never exchange the code.)

Then place the values:

- **Web** → `VITE_APPLE_CLIENT_ID` = the **Service ID** (`fr.clubping.web`),
  `VITE_APPLE_REDIRECT_URI` = the Return URL (defaults to `${origin}/login`).
- **Native iOS** → nothing to set; it uses the app bundle id automatically.
- **Backend** → `APPLE_CLIENT_IDS` = **comma-separated**: the Service ID **and**
  the bundle id `fr.clubping.app` (web and native tokens carry different `aud`).

---

## D. Where each value lives

> **Cloudflare Pages + wrangler.toml:** because this project ships a
> `wrangler.toml`, plain (non-secret) env vars are managed **only** in
> `wrangler.toml` `[vars]` — the dashboard refuses them and accepts **Secrets
> only**. So `RESEND_API_KEY` (the lone secret) goes in the dashboard, and every
> other backend value goes in `[vars]`.

| Value | Secret? | Local | Production |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | **yes** | `.dev.vars` | Pages dashboard → **Secret** (or `wrangler pages secret put`) |
| `RESEND_FROM` | no | `.dev.vars` | `wrangler.toml` `[vars]` |
| `GOOGLE_CLIENT_IDS` | no | `.dev.vars` | `wrangler.toml` `[vars]` |
| `APPLE_CLIENT_IDS` | no | `.dev.vars` | `wrangler.toml` `[vars]` |
| `VITE_GOOGLE_CLIENT_ID` | no | web `.env.local` | Pages **build** env var |
| `VITE_APPLE_CLIENT_ID` / `VITE_APPLE_REDIRECT_URI` | no | web `.env.local` | Pages build env var |
| `googleIosClientId` / `googleAndroidClientId` | no | `mobile/app.json` `expo.extra` | same (in the build) |

Templates: [`.dev.vars.example`](../.dev.vars.example),
[`.env.example`](../.env.example), [`mobile/.env.example`](../mobile/.env.example).

```bash
npx wrangler pages secret put RESEND_API_KEY        # the secret (prompts for value)
# non-secret backend vars -> wrangler.toml [vars] (committed)
```

---

## E. Local development (running with the session guard on)

The session guard (#98) rejects any `/api` request without a valid Bearer
session, except the public auth endpoints and image `GET`s. **Local dev runs it
too**, so auth mistakes fail on your machine instead of in production — which is
how the club-logo `401` shipped unnoticed (#137, #138).

What makes that workable is that local sign-in produces a **real** session:

```bash
npm run db:migrate:local && npm run db:seed:local   # users to sign in as
npm run dev:full                                    # http://localhost:8788
```

Sign in with **email OTP**, using any seeded member's address. Without
`RESEND_API_KEY` the backend does not send mail — it returns the code as
`devCode` and the login screen prints it as *Code (dev) : 123456*. That is the
production login path, exercised end to end on your machine.

The "pick any user" picker is a **build-time** flag (`VITE_DEV_LOGIN`), so it is
not drawn by `npm run dev:full`, which builds for production. To get it:

```bash
VITE_DEV_LOGIN=true npm run dev:full     # picker + DEV_LOGIN_ENABLED=true in .dev.vars
```

Then the picker signs in through `POST /api/auth/dev/login`, which mints a real
session exactly as a preview does — so the guard stays on either way.

- `npm run dev` (Vite alone, port 5173) has no backend and no proxy to one. The
  picker falls back to the mock fixtures and there is no API to guard —
  unchanged.
- `AUTH_GUARD_DISABLED=true` is an **escape hatch**, not the default: it bypasses
  the guard for every request, so anything auth-dependent becomes untestable
  locally. Reach for it only when the local database has no users to sign in as.
  It must never appear in `wrangler.toml` — `src/test/workflows.spec.ts` fails
  the build if it does.

Guard behaviour is covered by `functions/api/authGuard.test.ts`; new
auth-sensitive routes belong there.

---

## F. Verification checklist

- [ ] `POST /api/auth/email/request` no longer returns `devCode`; a real email arrives.
- [ ] Web: the Google button renders (GIS) and Apple button is enabled (not "à configurer").
- [ ] Web/mobile Google + Apple sign-in returns a session for an email that has a `users` row.
- [ ] An unknown email returns `403 no_account` (expected until #101).
