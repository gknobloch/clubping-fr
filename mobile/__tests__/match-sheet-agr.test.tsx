import { render, screen } from '@testing-library/react-native'
import { MatchSheet } from '@/components/MatchSheet'

// ---------------------------------------------------------------------------
// Feuille de match AGR — #650. Ses lettres partent de U à l'extérieur, et à
// quatre le mieux classé joue en V : la feuille s'ouvre en l'y plaçant. La
// règle est `@shared/lib/matchSheet`, testée à part ; ici, que l'app la lit.
// ---------------------------------------------------------------------------

const four = [
  { firstName: 'Léa', lastName: 'Arnold', points: '45' },
  { firstName: 'Marc', lastName: 'Bauer', points: '25' },
  { firstName: 'Noé', lastName: 'Christ', points: '60' },
  { firstName: 'Ugo', lastName: 'Dietrich', points: '30' },
]

const open = (federationId: string, isHome: boolean) =>
  render(
    <MatchSheet
      matchup="Kembs ASL TT 4 – Landser ASL 2"
      clubName="Landser ASL"
      affiliationNumber="680036"
      players={four}
      isHome={isHome}
      federationId={federationId}
      onClose={() => {}}
    />,
  )

describe('MatchSheet at the AGR (#650)', () => {
  it('letters the visitors from U and opens with the best ranked in V', () => {
    open('agr', false)
    for (const l of ['U', 'V', 'W', 'X']) expect(screen.getByText(l)).toBeTruthy()
    expect(screen.queryByText('Z')).toBeNull()
    // Rows read top to bottom: Léa (U), then Marc in V.
    const lastNames = screen.getAllByText(/^(Arnold|Bauer|Christ|Dietrich)$/).map((n) => n.props.children)
    expect(lastNames).toEqual(['Arnold', 'Bauer', 'Christ', 'Dietrich'])
    expect(screen.getByText('Le mieux classé joue en A à domicile, en V à l’extérieur.')).toBeTruthy()
  })

  it('opens at home with the best ranked in A', () => {
    open('agr', true)
    const lastNames = screen.getAllByText(/^(Arnold|Bauer|Christ|Dietrich)$/).map((n) => n.props.children)
    expect(lastNames).toEqual(['Bauer', 'Arnold', 'Christ', 'Dietrich'])
  })

  it('keeps the FFTT’s letters and free order', () => {
    open('fftt', false)
    for (const l of ['W', 'X', 'Y', 'Z']) expect(screen.getByText(l)).toBeTruthy()
    expect(screen.queryByText(/mieux classé/)).toBeNull()
  })
})
