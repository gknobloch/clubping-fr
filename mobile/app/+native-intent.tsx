import { parseGameSharePath } from '@shared/lib/gameShare'
import { holdSharedGame } from '@/utils/sharedGameLink'

/**
 * Every link the OS hands the app goes through here before expo-router routes
 * it (#747). A shared match — `https://clubping.fr/match/<id>`, or
 * `clubping://match/<id>` — is not a route: whose profile opens it is decided
 * once the session and the data are known (`SharedGameLinks`), so it is held
 * and the navigator goes to the Accueil, which the match screen is then
 * pushed over. Anything else is routed as it came.
 *
 * Never throws: a link the app cannot read must still open the app.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const shared = parseGameSharePath(path)
    if (shared) {
      holdSharedGame(shared)
      return '/'
    }
  } catch {
    /* route it as it came */
  }
  return path
}
