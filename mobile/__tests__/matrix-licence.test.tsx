import { screen } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import { MatchDayMatrix, type MatrixRow } from '@/components/MatchDayMatrix'
import type { Player, Team } from '@shared/types'

// #488 — the marker rides on the licence line in the matrix. This pins the
// rendering itself: the wiring that fills `unlicensed` is one thing, the row
// actually printing it is another, and only the second is what a captain sees.

const player = (id: string, firstName: string, licenseNumber?: string): Player => ({
  id, firstName, lastName: 'Martin', licenseNumber: licenseNumber ?? '',
  phone: '', status: 'active', clubId: 'c1',
})

const team = { id: 't1', clubId: 'c1', number: 5, captainId: 'p1' } as Team

const row = (p: Player, unlicensed?: boolean, licence = p.licenseNumber): MatrixRow => ({
  player: p,
  isCaptain: false,
  licence,
  unlicensed,
  availableCount: 0,
  playedCount: 0,
  totalGames: 0,
  cells: [],
})

const renderMatrix = (rows: MatrixRow[]) =>
  render(
    <MatchDayMatrix
      team={team}
      title="Rixheim PPA 5"
      days={[]}
      rows={rows}
      columns={{ joueur: 180, dispo: 64, joues: 64, brulage: 80, day: 96, total: 388 }}
      onEditAvailability={() => {}}
      onEditComposition={() => {}}
      onOpenGame={() => {}}
    />,
  )

describe('MatchDayMatrix — licence non validée (#488)', () => {
  it('marks the row the federation did not list', () => {
    renderMatrix([row(player('p1', 'Hugo', '9900015'), true)])
    // The number and the marker share one Text — the licence line — so the
    // marker is matched on its own and the number within the line.
    expect(screen.getByText('Sans licence')).toBeTruthy()
    expect(screen.getByText(/9900015/)).toBeTruthy()
  })

  it('says nothing for a licensee it did list', () => {
    renderMatrix([row(player('p2', 'Inès', '9900020'))])
    expect(screen.queryByText('Sans licence')).toBeNull()
  })

  it('still says it when the member has no licence number on file', () => {
    renderMatrix([row(player('p3', 'Paul'), true)])
    expect(screen.getByText('Sans licence')).toBeTruthy()
  })
})

// #644 — the line prints the licence the row's federation holds, which the
// screen resolves; an AGR team's row prints the AGR number, not the FFTT one.
describe('MatchDayMatrix — the licence of the section\'s federation (#644)', () => {
  it('prints the licence it is given, whatever the FFTT one is', () => {
    renderMatrix([row(player('p4', 'Gilles', '6810333'), false, '1251178')])
    expect(screen.getByText('1251178')).toBeTruthy()
    expect(screen.queryByText(/6810333/)).toBeNull()
  })
})
