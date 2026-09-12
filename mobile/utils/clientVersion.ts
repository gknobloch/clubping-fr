import { useEffect, useState } from 'react'
import { Linking, Platform } from 'react-native'
import {
  versionVerdict,
  type ClientVersionVerdict,
  type VersionFloor,
} from '@shared/lib/clientVersion'
import { apiUrl, clientHeaders, CLIENT_VERSION } from '@/constants/api'

/**
 * The version floor, fetched once per launch (#508).
 *
 * Once per launch and not once per mount: two components ask (the banner and
 * the blocking screen) and they must agree. A module-level promise is also what
 * keeps a boot that has no network from retrying on every render — the answer
 * is `null`, the verdict is `ok`, and the app carries on.
 *
 * Nothing here ever throws. A refusal, a timeout, a body that is not JSON: all
 * of them mean "no floor", because a check that cannot reach the server must
 * not be the thing that stops a member reading a line-up in a basement (#387).
 */
let pending: Promise<VersionFloor | null> | null = null

// No timeout, deliberately. A request that never answers leaves this promise
// pending, the verdict sits at its initial `ok`, and the app carries on — which
// is the same outcome a timeout would have produced, by a shorter road.
async function fetchFloor(): Promise<VersionFloor | null> {
  try {
    const res = await fetch(apiUrl('/client-version'), { headers: clientHeaders() })
    if (!res.ok) return null
    const body = (await res.json()) as VersionFloor | null
    return body && typeof body === 'object' ? body : null
  } catch {
    return null
  }
}

export function clientVersionFloor(): Promise<VersionFloor | null> {
  pending ??= fetchFloor()
  return pending
}

/** Test seam — the module cache is per-process, and each case wants its own. */
export function resetClientVersionFloor(): void {
  pending = null
}

/**
 * What this build should do about the floor.
 *
 * Starts at `ok` and only ever moves away from it once the server has said
 * something parseable, so the first frames of a cold start are never a blocking
 * screen thrown up by a request still in flight.
 */
export function useClientVersionVerdict(): ClientVersionVerdict {
  const [verdict, setVerdict] = useState<ClientVersionVerdict>('ok')

  useEffect(() => {
    let cancelled = false
    clientVersionFloor().then((floor) => {
      if (!cancelled) setVerdict(versionVerdict(CLIENT_VERSION, floor))
    })
    return () => {
      cancelled = true
    }
  }, [])

  return verdict
}

/**
 * Where an out-of-date build is sent.
 *
 * The store, and only the store. EAS Update is configured, but
 * `runtimeVersion.policy` is `appVersion` — an over-the-air update reaches only
 * builds already carrying the version it was published for, so it can never
 * rescue an earlier one. Whatever we might wish, the binary has to be replaced.
 */
const APP_STORE_URL = 'itms-apps://apps.apple.com/app/id6799859449'
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=fr.clubping.app'

export function openStore(): void {
  const url = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL
  Linking.openURL(url).catch(() => {
    /* No store app (a simulator, a stripped device). Nothing useful to say. */
  })
}
