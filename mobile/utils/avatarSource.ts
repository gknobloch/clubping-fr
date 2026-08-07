import { apiUrl } from '@/constants/api'
import { getSessionToken } from '@/utils/api'

// Authenticated, cache-busting image source for a player's avatar — shared by
// the round Avatar and the enlarged AvatarViewer so the URI/header logic lives
// in one place.
export function avatarImageSource(playerId: string, avatarUpdatedAt: string) {
  const token = getSessionToken()
  return {
    uri: `${apiUrl(`/users/${playerId}/avatar`)}?v=${encodeURIComponent(avatarUpdatedAt)}`,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }
}
