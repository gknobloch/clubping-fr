import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen, within } from '@/test/test-utils'
import { LoginPage } from './LoginPage'
import { mockClubs } from '@/mock/data'

describe('LoginPage', () => {
  it('renders the email sign-in step', () => {
    render(<LoginPage />)
    expect(screen.getByRole('heading', { name: /Club Ping/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Adresse e-mail/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Recevoir un code/i })).toBeInTheDocument()
  })

  it('does not offer Google or Apple sign-in until OAuth is configured (#129)', () => {
    render(<LoginPage />)
    expect(screen.queryByRole('button', { name: /Google/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Apple/i })).not.toBeInTheDocument()
  })

  // #351 — the login screen is the only place a member meets the app before
  // knowing what it does, and the mark appears nowhere else above 28px.
  it('shows the brand mark at a size worth calling a logo', () => {
    render(<LoginPage />)

    const mark = screen.getByRole('img', { name: 'Club Ping' })
    // h-16 inside a 96px disc — the nav bar's copy is h-7, which is what
    // prompted this.
    expect(mark.getAttribute('class')).toContain('h-16')
    expect(mark.parentElement?.className).toContain('rounded-full')
  })

  it('says what the app is for', () => {
    render(<LoginPage />)

    expect(
      screen.getByText(/joueurs, équipes, disponibilités et composition des rencontres/i),
    ).toBeInTheDocument()
  })

  it('keeps the step caption separate from the description', () => {
    render(<LoginPage />)

    // Both are present: one explains the app, the other tells you what to do
    // next and changes with the step.
    expect(screen.getByText(/Le tennis de table de club au quotidien/i)).toBeInTheDocument()
    expect(screen.getByText('Connectez-vous pour continuer')).toBeInTheDocument()
  })

  it('shows the dev login picker in dev mode', () => {
    render(<LoginPage />)
    expect(screen.getByText(/Mode développement/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Nom ou adresse email/i)).toBeInTheDocument()
  })
})

// #345 — a preview's database is anonymised, so the pseudonyms say nothing
// about who administers what. The badges are what make the list usable.
describe('LoginPage — dev picker role context (#345)', () => {
  function openPicker() {
    render(<LoginPage />)
    fireEvent.focus(screen.getByPlaceholderText(/Nom ou adresse email/i))
    return screen.getByRole('listbox')
  }

  function search(term: string) {
    render(<LoginPage />)
    const input = screen.getByPlaceholderText(/Nom ou adresse email/i)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: term } })
    return screen.getByRole('listbox')
  }

  it('badges every role', () => {
    const list = openPicker()
    expect(within(list).getByText('Admin général')).toBeInTheDocument()
    // Plural since #474: a club may have up to 5 admins, and one of them is
    // an ordinary player of the club who was promoted.
    expect(within(list).getAllByText('Admin club').length).toBeGreaterThan(0)
    expect(within(list).getAllByText('Joueur').length).toBeGreaterThan(0)
  })

  it('lists the administrators before the players', () => {
    const list = openPicker()
    const badges = within(list)
      .getAllByText(/Admin général|Admin club|Joueur/)
      .map((el) => el.textContent)

    // The rule is the ordering, not the count: how many club admins there are
    // is the fixtures' business, and #474 made it more than one.
    expect(badges[0]).toBe('Admin général')
    const firstPlayer = badges.indexOf('Joueur')
    expect(firstPlayer).toBeGreaterThan(0)
    expect(badges.slice(1, firstPlayer).every((b) => b === 'Admin club')).toBe(true)
    expect(badges.slice(firstPlayer).every((b) => b === 'Joueur')).toBe(true)
  })

  it('marks a captain with the teams they lead', () => {
    // p2-player-2 captains team 1 in the fixtures.
    const list = search('capitaine')
    expect(within(list).getAllByText(/^Capitaine/).length).toBeGreaterThan(0)
    expect(within(list).getAllByText('Capitaine 1').length).toBeGreaterThan(0)
  })

  it('finds accounts by role, which is all one can type on a preview', () => {
    const list = search('admin général')
    const options = within(list).getAllByRole('option')

    expect(options).toHaveLength(1)
    expect(within(options[0]).getByText('Admin général')).toBeInTheDocument()
  })

  it('shows the club name rather than the anonymised address', () => {
    const list = openPicker()
    // The club comes from the payload now; resolving it through the mock
    // fixtures used to fall back to the e-mail on a preview.
    expect(within(list).getAllByText(mockClubs[0].displayName).length).toBeGreaterThan(0)
  })
})
