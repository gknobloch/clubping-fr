import Constants from 'expo-constants'

const manifest = Constants.expoConfig?.extra

// Default: production, reached through the custom domain rather than the
// Pages hostname — the app ships in binaries we cannot re-point, so it must
// not be tied to a Pages project name (#268 renamed one already).
// Override with EXPO_PUBLIC_API_URL to point at a local wrangler dev server.
const PROD_API_URL = 'https://clubping.fr'

// The hosts that serve production data: the custom domain, and the Pages
// project's own hostname, which answers for the production deployment.
//
// A `pr-N.` subdomain is NOT one of them — it is a preview, on the anonymised
// clubping-fr-dev database, and it offers dev login exactly as the web
// previews do (#296, #313). Matching them all with one `includes` is what used
// to leave a preview unusable from the app: the right database, no way in
// (#452). Hence an exact host comparison rather than a substring.
const PRODUCTION_API_HOSTS = ['clubping.fr', 'www.clubping.fr', 'clubping-fr.pages.dev']

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (manifest?.apiUrl as string | undefined) ??
  PROD_API_URL

/** Host of API_BASE_URL, without scheme, port or path. */
const apiHost = API_BASE_URL.replace(/^[a-z]+:\/\//i, '')
  .split('/')[0]
  .split(':')[0]
  .toLowerCase()

// True only against the production backend. Used to make sure the app never
// so much as asks it for a dev-login user list.
export const IS_PRODUCTION_API = PRODUCTION_API_HOSTS.includes(apiHost)

export function apiUrl(path: string): string {
  return `${API_BASE_URL}/api${path}`
}
