import type { GameNeighbours } from '@shared/lib/gameNeighbours'
import { PagerDots } from '@/components/Pager'

// ---------------------------------------------------------------------------
// Passer d'un match au suivant (#552)
//
// The match screen is where a club officer collecting availabilities and a
// captain preparing a phase both spend their time, and both used to leave it
// through the back button to open the match right next to it. This is that
// step, in place: swipe the screen, and the dots under the header card say
// where you are.
//
// The carousel itself — the dots and the gesture rule — is `Pager`, which the
// FFTT import's review also uses (#555). What belongs to #552 is the axis
// those dots count along: `gameNeighbours` decides what "next" means, and this
// says nothing about it beyond where along it you stand.
// ---------------------------------------------------------------------------
export function GamePager({ neighbours }: { neighbours: GameNeighbours }) {
  return <PagerDots testID="game-dots" index={neighbours.index} total={neighbours.total} />
}
