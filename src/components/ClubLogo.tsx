import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

// Round club logo (web). Mirrors Avatar.tsx's fetch-as-blob approach for
// consistency, even though the logo endpoint is public. Renders nothing when
// the club has no logo (or the fetch fails) — unlike Avatar, there's no
// meaningful fallback for a club, so it's simply omitted.
export function ClubLogo({
  clubId,
  logoUpdatedAt,
  size = 48,
  className = '',
  sizeClass,
}: {
  clubId: string
  logoUpdatedAt?: string
  size?: number
  className?: string
  /** Tailwind sizing instead of `size`; the inline box would win over classes. */
  sizeClass?: string
}) {
  const { token } = useAuth()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!logoUpdatedAt) {
      setUrl(null)
      return
    }
    let active = true
    let objectUrl: string | null = null
    fetch(`/api/clubs/${clubId}/logo?v=${encodeURIComponent(logoUpdatedAt)}`, {
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
  }, [clubId, logoUpdatedAt, token])

  if (!url) return null

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white ${sizeClass ?? ''} ${className}`}
      style={sizeClass ? undefined : { width: size, height: size }}
    >
      <img src={url} alt="" className="h-full w-full object-contain" />
    </div>
  )
}
