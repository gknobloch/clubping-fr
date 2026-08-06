import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

// Round player avatar (web). The avatar endpoint requires the Authorization
// bearer header, which an <img src> can't send, so we fetch the image as a blob
// and render it via an object URL. Falls back to initials when the player has
// no avatar (or the fetch fails). Mirrors mobile/components/Avatar.tsx.
export function Avatar({
  playerId,
  avatarUpdatedAt,
  firstName,
  lastName,
  size = 48,
  className = '',
}: {
  playerId: string
  avatarUpdatedAt?: string
  firstName?: string
  lastName?: string
  size?: number
  className?: string
}) {
  const { token } = useAuth()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!avatarUpdatedAt) {
      setUrl(null)
      return
    }
    let active = true
    let objectUrl: string | null = null
    fetch(`/api/users/${playerId}/avatar?v=${encodeURIComponent(avatarUpdatedAt)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (active) setUrl(null)
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [playerId, avatarUpdatedAt, token])

  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?'
  const box = { width: size, height: size }

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 ${className}`}
      style={box}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-bold text-slate-500" style={{ fontSize: Math.round(size * 0.4) }}>
          {initials}
        </span>
      )}
    </div>
  )
}
