// The session guard's path decision (#98, #138), kept apart from the request
// handling so it can be tested as what it is: a pure question about a method
// and a path, with no database, no token, and no Hono in the way.
//
// It lives here rather than in `[[path]].ts` because getting it wrong fails
// silently in one direction (an endpoint quietly public) and invisibly in the
// other (every avatar 401s, which an <img> renders as a broken image rather
// than an error). Both are worth pinning down on their own.

// Endpoints that must work without a session — you are not logged in yet.
// `dev/` is unauthenticated by nature: it is how you obtain a session on a
// preview. It is inert unless DEV_LOGIN_ENABLED is set, which only the preview
// environment and an opted-in local `.dev.vars` do (#313).
const PUBLIC_PATH = /^\/api\/auth\/(email\/|oauth$|dev\/)/

// Asking to administer a club is the one write a stranger may make (#474).
// It has to be public for the same reason the feature exists: sign-in only
// mails a code to an address that already has a row, so someone whose club the
// app has never heard of cannot get far enough in to ask. POST only — reading
// the queue and deciding on it are a general admin's, and go through the guard
// like everything else.
const PUBLIC_ONBOARDING_PATH = /^\/api\/onboarding\/requests$/

// The club's confirmation step (#474). A correspondent has no account — giving
// them one to click a link would defeat the point of asking them — so the link
// carries a one-shot token and these two are addressed by it rather than by a
// session. GET reads the one request behind the token, POST confirms it;
// neither can reach anything else.
const PUBLIC_CONFIRM_PATH = /^\/api\/onboarding\/confirm$/

// Image endpoints are served to <img> / <Image> tags, which cannot attach an
// Authorization header — so GETs to them are public (read-only, non-sensitive
// logos / avatars). Writes still require a session.
const PUBLIC_IMAGE_PATH = /^\/api\/(clubs\/[^/]+\/logo|users\/[^/]+\/avatar)$/

/**
 * Whether a request must carry a valid Bearer session to be served.
 *
 * Takes the method and pathname only: the `AUTH_GUARD_DISABLED` bypass is a
 * property of the environment, not of the route, and stays with the middleware.
 */
export function needsSession(method: string, path: string): boolean {
  if (PUBLIC_PATH.test(path)) return false
  if (method === 'GET' && PUBLIC_IMAGE_PATH.test(path)) return false
  if (method === 'POST' && PUBLIC_ONBOARDING_PATH.test(path)) return false
  if ((method === 'GET' || method === 'POST') && PUBLIC_CONFIRM_PATH.test(path)) return false
  return true
}
