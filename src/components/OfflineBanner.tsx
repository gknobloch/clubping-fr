import { useEffect, useState } from 'react'
import { useAppData } from '@/contexts/DataContext'
import { formatFetchedAt } from '@/lib/offlineCache'

/**
 * Says the screen is showing what was last known rather than what is true now
 * (#387), mirroring the native app's banner.
 *
 * Two conditions, because they are not the same thing and neither implies the
 * other: the browser reports no connection, or the last refresh failed while a
 * connection was reported. A club's Wi-Fi that resolves but routes nowhere
 * gives the second without the first.
 */
export function OfflineBanner() {
  const { staleSince } = useAppData()
  const [online, setOnline] = useState(() => navigator.onLine !== false)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (online && !staleSince) return null

  const when = staleSince ? formatFetchedAt(staleSince) : ''

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-slate-700 px-4 py-1.5 text-center text-xs font-medium text-white"
    >
      <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M12 12h.01M3 3l18 18"
        />
      </svg>
      {when ? `Hors ligne — données du ${when}` : 'Mode hors ligne'}
    </div>
  )
}
