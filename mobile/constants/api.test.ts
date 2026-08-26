/**
 * Which backend the app thinks it is talking to (#452).
 *
 * The distinction that matters is production vs everything else: a `pr-N.`
 * preview runs on the anonymised clubping-fr-dev database with dev login
 * enabled, and used to be lumped in with production by a substring match —
 * which left it holding the right data with no way to sign in.
 *
 * EXPO_PUBLIC_API_URL is read at module load, so each case re-imports.
 */
jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }))

function loadFor(url?: string) {
  let mod!: typeof import('./api')
  jest.isolateModules(() => {
    if (url === undefined) delete process.env.EXPO_PUBLIC_API_URL
    else process.env.EXPO_PUBLIC_API_URL = url
    // isolateModules is synchronous, so this has to be a require.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./api')
  })
  return mod
}

const original = process.env.EXPO_PUBLIC_API_URL
afterEach(() => {
  if (original === undefined) delete process.env.EXPO_PUBLIC_API_URL
  else process.env.EXPO_PUBLIC_API_URL = original
})

it('defaults to the production custom domain', () => {
  const { API_BASE_URL, IS_PRODUCTION_API } = loadFor(undefined)
  expect(API_BASE_URL).toBe('https://clubping.fr')
  expect(IS_PRODUCTION_API).toBe(true)
})

it.each([
  'https://clubping.fr',
  'https://www.clubping.fr',
  'https://clubping.fr/',
  // The Pages hostname answers for the production deployment too.
  'https://clubping-fr.pages.dev',
])('treats %s as production', (url) => {
  expect(loadFor(url).IS_PRODUCTION_API).toBe(true)
})

it.each([
  // A PR preview: the anonymised database, and dev login (#296, #313).
  'https://pr-451.clubping-fr.pages.dev',
  'https://pr-451.clubping-fr.pages.dev/',
  // A local wrangler dev server, on either host form.
  'http://localhost:8788',
  'http://127.0.0.1:8788',
  'http://192.168.1.20:8788',
])('does not treat %s as production', (url) => {
  expect(loadFor(url).IS_PRODUCTION_API).toBe(false)
})

it('builds API urls under /api', () => {
  expect(loadFor('https://pr-451.clubping-fr.pages.dev').apiUrl('/auth/dev/users')).toBe(
    'https://pr-451.clubping-fr.pages.dev/api/auth/dev/users',
  )
})
