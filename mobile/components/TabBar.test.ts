import { pathToTab } from './TabBar'

// Which tab stays highlighted for a given path (#153). The detail screens live
// in a hidden stack, so nothing derives this from the navigator — this mapping
// is it, and a missing entry silently highlights Accueil.
describe('pathToTab', () => {
  it.each([
    ['/', 'index'],
    ['/club', 'club'],
    ['/equipes', 'equipes'],
    ['/journees', 'journees'],
    ['/joueurs', 'joueurs'],
  ])('maps the section %s to %s', (path, tab) => {
    expect(pathToTab(path, false)).toBe(tab)
  })

  it.each([
    ['/player/p1', 'joueurs'],
    ['/team/t1', 'equipes'],
    ['/team/phase-games', 'equipes'],
    ['/match/g1', 'journees'],
  ])('keeps the section highlighted while drilling into %s', (path, tab) => {
    expect(pathToTab(path, false)).toBe(tab)
  })

  it('splits "mes matchs" by where it was opened from', () => {
    expect(pathToTab('/mes-matchs', true)).toBe('joueurs') // a player's matches
    expect(pathToTab('/mes-matchs', false)).toBe('index') // the Accueil shortcut
  })

  it('highlights no tab on the account screen', () => {
    // Compte left the tab bar for the header avatar (#365), so its route name
    // matches no rendered tab — which is what leaves them all inactive.
    expect(pathToTab('/compte', false)).toBe('compte')
  })
})
