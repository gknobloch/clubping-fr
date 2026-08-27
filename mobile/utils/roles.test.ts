import type { Team, User } from '@shared/types'
import { availabilityOverride, canEditAvailability, canManageTeam } from './roles'

// ---------------------------------------------------------------------------
// Who may answer for whom (#462)
//
// The app used `canManageTeam` — the line-up rule — for availabilities, and the
// two differ exactly where it matters. `src/lib/useMatchDayEditing.ts` holds the
// web's version of what follows; these tests are the pair that keeps them from
// drifting apart.
// ---------------------------------------------------------------------------
const team: Team = {
  id: 't1', clubId: 'c1', phaseId: 'ph1', number: 5,
  divisionId: 'd1', groupId: 'g1', gameLocationId: 'a1',
  defaultDay: 'Jeudi', defaultTime: '19h30', captainId: 'captain',
  isArchived: false, playerIds: ['captain', 'player', 'other'],
}

const user = (id: string, role: User['role'], clubId?: string): User =>
  ({ id, role, isPlayer: true, clubId }) as User

const player = user('player', 'player', 'c1')
const captain = user('captain', 'player', 'c1')
const clubAdmin = user('admin', 'club_admin', 'c1')
const otherClubAdmin = user('admin2', 'club_admin', 'c2')
const generalAdmin = user('root', 'general_admin')

describe('canEditAvailability', () => {
  it('lets anyone answer for themselves', () => {
    expect(canEditAvailability(player, team, 'player')).toBe(true)
  })

  it('lets the captain answer for their team', () => {
    expect(canEditAvailability(captain, team, 'player')).toBe(true)
  })

  it("lets a club's administrator answer for that club's teams", () => {
    // The same reach as a captain, across every team of the club — which is
    // what the Journées matrix has always granted them on the web.
    expect(canEditAvailability(clubAdmin, team, 'player')).toBe(true)
  })

  it('stops a club administrator at their own club', () => {
    expect(canEditAvailability(otherClubAdmin, team, 'player')).toBe(false)
  })

  it('stops a general administrator, who composes teams but answers for nobody', () => {
    // The one place this parts company with `canManageTeam`: an availability is
    // a personal declaration, and somebody administering every club in the
    // country is not in that loop.
    expect(canManageTeam(generalAdmin, team)).toBe(true)
    expect(canEditAvailability(generalAdmin, team, 'player')).toBe(false)
  })

  it('stops a team-mate', () => {
    expect(canEditAvailability(player, team, 'other')).toBe(false)
  })
})

describe('availabilityOverride', () => {
  it('records nothing when a player answers for themselves', () => {
    // Which is also what clears an override the captain had left behind: the
    // API writes this column on every upsert.
    expect(availabilityOverride(player, team, 'player')).toBeUndefined()
    expect(availabilityOverride(captain, team, 'captain')).toBeUndefined()
  })

  it('names the captain who answered for someone', () => {
    expect(availabilityOverride(captain, team, 'player')).toBe('captain')
  })

  it("names the club's administrator", () => {
    expect(availabilityOverride(clubAdmin, team, 'player')).toBe('club_admin')
  })

  it('records nothing for someone who could not have answered at all', () => {
    expect(availabilityOverride(otherClubAdmin, team, 'player')).toBeUndefined()
    expect(availabilityOverride(generalAdmin, team, 'player')).toBeUndefined()
  })
})
