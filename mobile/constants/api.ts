import Constants from 'expo-constants'

const manifest = Constants.expoConfig?.extra

// Default: production, reached through the custom domain rather than the
// Pages hostname — the app ships in binaries we cannot re-point, so it must
// not be tied to a Pages project name (#268 renamed one already).
// Override with EXPO_PUBLIC_API_URL to point at a local wrangler dev server.
const PROD_API_URL = 'https://clubping.fr'

// Every host that counts as a real deployed backend: the custom domain, and
// the Pages hostname with its `pr-*.` preview subdomains.
const DEPLOYED_API_HOSTS = ['clubping.fr', 'clubping-fr.pages.dev']

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (manifest?.apiUrl as string | undefined) ??
  PROD_API_URL

// True whenever we target the deployed Cloudflare backend (prod or a preview
// deployment). Used to hide dev login when talking to a real backend, even in
// a dev build.
export const IS_DEPLOYED_API = DEPLOYED_API_HOSTS.some((host) =>
  API_BASE_URL.includes(host),
)

export function apiUrl(path: string): string {
  return `${API_BASE_URL}/api${path}`
}
