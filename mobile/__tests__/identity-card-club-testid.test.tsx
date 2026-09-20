import { screen } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import type { Club } from '@shared/types'
import { PlayerIdentityCard } from '@/components/PlayerIdentityCard'

// ---------------------------------------------------------------------------
// The club line names its club (#595)
//
// `login.yaml` used to prove only that SOMEBODY was logged in — it waited for
// `tab-bar`, which a session left behind by anything else also reaches. During
// the 1.5.0 captures that was Expo Go, foregrounded with a dev session open on
// a real club, and Maestro read its hierarchy instead of the app's.
//
// The flow now asserts `identity-club-demo-club`. Nothing else can check that
// id: CI has no device, and the next capture session is where a typo would
// otherwise surface — as a failure four screenshots into a run, which is the
// exact shape of confusion this issue exists to remove. So the contract is
// pinned here, on the component that has to honour it.
// ---------------------------------------------------------------------------

const club = (id: string, displayName: string) =>
  ({ id, displayName, number: '09990001' }) as unknown as Club

describe('PlayerIdentityCard', () => {
  it('keys the club line by id, which is what the capture flow asserts', () => {
    render(<PlayerIdentityCard playerId="p1" name="Julien Mercier" club={club('demo-club', 'Club Démo Pongiste')} />)
    expect(screen.getByTestId('identity-club-demo-club')).toBeTruthy()
  })

  it('still prints the club’s name, which is what a member reads', () => {
    render(<PlayerIdentityCard playerId="p1" name="Julien Mercier" club={club('demo-club', 'Club Démo Pongiste')} />)
    expect(screen.getByTestId('identity-club-demo-club')).toHaveTextContent('Club Démo Pongiste')
  })

  it('gives another club another id — the assertion must not pass for any club', () => {
    render(<PlayerIdentityCard playerId="p1" name="Gilles Knobloch" club={club('club-rixheim', 'Rixheim PPA')} />)
    expect(screen.queryByTestId('identity-club-demo-club')).toBeNull()
    expect(screen.getByTestId('identity-club-club-rixheim')).toBeTruthy()
  })

  it('renders no club line at all when the member has no club', () => {
    render(<PlayerIdentityCard playerId="p1" name="Julien Mercier" />)
    expect(screen.queryByTestId('identity-club-demo-club')).toBeNull()
  })
})
