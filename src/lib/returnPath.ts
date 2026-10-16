// Web only (sessionStorage). Where a signed-out visit was headed, so signing in
// lands there rather than on the Accueil — a shared match link opened before
// the code arrived by e-mail (#747).
//
// sessionStorage and not router state: Google's sign-in leaves the site and
// comes back, and the state of a history entry does not survive that.
const KEY = 'pp-return-path'

export function rememberReturnPath(path: string): void {
  // Only paths of this site: never a scheme or a protocol-relative URL.
  if (!path.startsWith('/') || path.startsWith('//') || path === '/') return
  try {
    sessionStorage.setItem(KEY, path)
  } catch {
    /* private window or blocked storage: the Accueil it is */
  }
}

/**
 * The remembered path, if any. Read without being consumed, because it is read
 * in render (twice, under StrictMode); `forgetReturnPath` clears it once the
 * signed-in shell is up.
 */
export function readReturnPath(): string | null {
  try {
    const path = sessionStorage.getItem(KEY)
    return path && path.startsWith('/') && !path.startsWith('//') ? path : null
  } catch {
    return null
  }
}

export function forgetReturnPath(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* nothing to forget */
  }
}
