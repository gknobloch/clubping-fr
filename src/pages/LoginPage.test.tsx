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
    expect(within(list).getByText('Admin club')).toBeInTheDocument()
    expect(within(list).getAllByText('Joueur').length).toBeGreaterThan(0)
  })

  it('lists the administrators before the players', () => {
    const list = openPicker()
    const badges = within(list)
      .getAllByText(/Admin général|Admin club|Joueur/)
      .map((el) => el.textContent)

    expect(badges[0]).toBe('Admin général')
    expect(badges[1]).toBe('Admin club')
    expect(badges.slice(2).every((b) => b === 'Joueur')).toBe(true)
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
