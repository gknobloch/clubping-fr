import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { RequestsPage } from './RequestsPage'
import type { ClubAdminRequest } from '@/lib/clubAdminRequests'

// #474 — the review queue. Its one job is to let a general admin judge a
// request against FFTT rather than against the requester's word for it, so
// most of what these tests protect is the line between the two.

const api = vi.hoisted(() => ({
  fetchClubAdminRequests: vi.fn(),
  decideClubAdminRequest: vi.fn(),
  fetchClubDetailXmlFromBrowser: vi.fn(),
}))
const auth = vi.hoisted(() => ({ user: null as unknown }))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: false,
  useAuth: () => ({ user: auth.user, token: 'tok', logout: vi.fn() }),
}))

vi.mock('@/contexts/DataContext', () => ({ useAppData: () => ({ clubs: [] }) }))

vi.mock('@/lib/onboardingApi', () => ({
  fetchClubAdminRequests: (...a: unknown[]) => api.fetchClubAdminRequests(...a),
  decideClubAdminRequest: (...a: unknown[]) => api.decideClubAdminRequest(...a),
}))

vi.mock('@/lib/ffttClub', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ffttClub')>()),
  fetchClubDetailXmlFromBrowser: (...a: unknown[]) => api.fetchClubDetailXmlFromBrowser(...a),
}))

/** FFTT's real answer for Mulhouse, which the review screen re-reads live. */
const LIVE_XML =
  '<?xml version="1.0" encoding="ISO-8859-1"?>' +
  '<liste><club><numero>06680105</numero><nom>MULHOUSE TENNIS DE TABLE</nom>' +
  '<nomsalle>Salle Specifique MTT</nomsalle><adressesalle1>Rue Jean Martin</adressesalle1>' +
  '<codepsalle>68200</codepsalle><villesalle>MULHOUSE</villesalle>' +
  '<nomcor>BARLINGE</nomcor><prenomcor>Virginie</prenomcor>' +
  '<mailcor>Mulhouse-tennis-de-table@orange.fr</mailcor><telcor>0686839957</telcor>' +
  '</club></liste>'

/**
 * A request whose snapshot names the requester as the correspondent — the
 * shape a forged submission takes, since the snapshot comes from their browser.
 */
const impostor: ClubAdminRequest = {
  id: 'r-imp',
  affiliationNumber: '06680105',
  email: 'imposteur@example.invalid',
  firstName: 'Jean',
  lastName: 'Imposteur',
  phone: '0600000000',
  message: 'Je suis le président, promis.',
  snapshot: {
    displayName: 'Club Inventé',
    venue: 'Salle imaginaire',
    correspondentName: 'Jean Imposteur',
    correspondentEmail: 'imposteur@example.invalid',
    correspondentPhone: '0600000000',
  },
  licenseNumber: '',
  correspondentEmail: 'Mulhouse-tennis-de-table@orange.fr',
  clubConfirmedAt: '2026-08-28T11:00:00.000Z',
  status: 'pending_admin',
  createdAt: '2026-08-28T10:00:00.000Z',
}

const honest: ClubAdminRequest = {
  ...impostor,
  id: 'r-ok',
  email: 'Mulhouse-tennis-de-table@orange.fr',
  firstName: 'Virginie',
  lastName: 'Barlinge',
  snapshot: {
    displayName: 'Mulhouse Tennis de Table',
    venue: 'Salle Specifique MTT · Rue Jean Martin, 68200 Mulhouse',
    correspondentName: 'Virginie Barlinge',
    correspondentEmail: 'Mulhouse-tennis-de-table@orange.fr',
    correspondentPhone: '0686839957',
  },
}

function setup(requests: ClubAdminRequest[]) {
  auth.user = { id: 'g1', role: 'general_admin', isPlayer: false }
  api.fetchClubAdminRequests.mockResolvedValue({ requests })
  return userEvent.setup()
}

const renderPage = () => render(<MemoryRouter><RequestsPage /></MemoryRouter>)

beforeEach(() => {
  api.fetchClubAdminRequests.mockReset()
  api.decideClubAdminRequest.mockReset().mockResolvedValue({ ok: true })
  api.fetchClubDetailXmlFromBrowser.mockReset().mockResolvedValue(LIVE_XML)
})

describe('the queue (#474)', () => {
  it('lists the pending requests', async () => {
    setup([honest])
    renderPage()
    expect((await screen.findAllByText('Virginie Barlinge')).length).toBeGreaterThan(0)
    expect(screen.getByText('À traiter')).toBeInTheDocument()
  })

  it('says so when there is nothing to decide', async () => {
    setup([])
    renderPage()
    expect(await screen.findByText(/Aucune demande en attente/)).toBeInTheDocument()
  })

  // The club step is a filter, not a gate the admin can jump: a request still
  // with its club is not theirs to decide yet.
  it('shows a request still with its club, but offers no decision on it', async () => {
    setup([{ ...honest, status: 'pending_club', clubConfirmedAt: undefined }])
    renderPage()
    expect(await screen.findByText('En attente du club')).toBeInTheDocument()
    expect(screen.getByText(/En attente de la confirmation du club/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vérifier et décider' })).not.toBeInTheDocument()
  })

  it('says which address the club confirmed from', async () => {
    setup([honest])
    renderPage()
    expect(await screen.findByText(/Confirmée par le club depuis/)).toBeInTheDocument()
  })

  // A club FFTT lists no address for cannot confirm, and must not therefore be
  // a club nobody can ever join — but the admin has to know that is why.
  it('flags a request no club could confirm', async () => {
    setup([{ ...honest, correspondentEmail: '', clubConfirmedAt: undefined }])
    renderPage()
    expect(await screen.findByText(/ne publiait aucune adresse/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vérifier et décider' })).toBeInTheDocument()
  })

  it('shows the licence when one was given, and what it will do', async () => {
    setup([{ ...honest, licenseNumber: '425881' }])
    renderPage()
    expect(await screen.findByText('425881')).toBeInTheDocument()
    expect(screen.getByText(/plutôt que créer une seconde fiche/)).toBeInTheDocument()
  })

  // A build that meets a status it predates must not hide the work: this is
  // the shape of the bug that was seen — a stale page filing every confirmed
  // request under "traitées", where nobody was looking.
  it('keeps a status it does not recognise in the queue, not in the archive', async () => {
    setup([{ ...honest, status: 'pending_league' as unknown as ClubAdminRequest['status'] }])
    renderPage()
    // Listed by default, i.e. among the live ones rather than the decided.
    expect((await screen.findAllByText('Virginie Barlinge')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Afficher les demandes traitées/)).not.toBeInTheDocument()
    // And badged with something a reader can act on.
    expect(screen.getByText('pending_league')).toBeInTheDocument()
  })

  it('is closed to anyone but a general admin', async () => {
    setup([honest])
    auth.user = { id: 'a1', role: 'club_admin', clubId: 'club-1', isPlayer: false }
    renderPage()
    expect(await screen.findByText(/réservée aux administrateurs généraux/)).toBeInTheDocument()
  })
})

describe('the card never passes judgement on declared data (#474)', () => {
  // The snapshot comes from the requester's browser. Comparing their address
  // against a correspondent they submitted only asks whether their own form
  // agrees with itself — and would hand a forged request a reassuring badge.
  it('shows no match verdict, not even for a snapshot that names the requester', async () => {
    setup([impostor])
    renderPage()
    await screen.findAllByText('Jean Imposteur')
    expect(screen.queryByText(/Adresse identique à celle de la FFTT/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Même domaine que la FFTT/)).not.toBeInTheDocument()
  })

  it('labels the declared contact as declarative, to be confronted', async () => {
    setup([impostor])
    renderPage()
    await screen.findAllByText('Jean Imposteur')
    expect(screen.getByText(/tel que déclaré par le demandeur/i)).toBeInTheDocument()
    expect(screen.getByText(/à confronter à la FFTT/i)).toBeInTheDocument()
  })
})

describe('deciding, against a live reading (#474)', () => {
  it('only shows a verdict once FFTT has actually been re-read', async () => {
    const user = setup([honest])
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Vérifier et décider' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText(/Adresse identique à celle de la FFTT/)).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Vérifier maintenant' }))
    expect(await within(dialog).findByText(/Adresse identique à celle de la FFTT/)).toBeInTheDocument()
  })

  // The impostor's own snapshot said something else entirely; the live read is
  // what the admin is shown, with the claim marked as the outlier.
  it('flags each field the requester declared differently', async () => {
    const user = setup([impostor])
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Vérifier et décider' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Vérifier maintenant' }))

    expect(await within(dialog).findByText('Mulhouse Tennis de Table')).toBeInTheDocument()
    expect(within(dialog).getByText(/Déclaré.*Club Inventé/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Déclaré.*Jean Imposteur/)).toBeInTheDocument()
    // And the verdict against the *live* correspondent, which is unflattering.
    expect(within(dialog).getByText(/Adresse différente de celle de la FFTT/)).toBeInTheDocument()
  })

  it('sends the live club record when approving, never the declared one', async () => {
    const user = setup([impostor])
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Vérifier et décider' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Vérifier maintenant' }))
    await within(dialog).findByText('Mulhouse Tennis de Table')
    await user.click(within(dialog).getByRole('button', { name: 'Accepter' }))

    const [, decision] = api.decideClubAdminRequest.mock.calls[0]
    expect(decision.status).toBe('approved')
    expect(decision.club.displayName).toBe('Mulhouse Tennis de Table')
    expect(decision.club.city).toBe('Mulhouse')
  })

  // Approving an unknown club creates it, so its name must not be taken on
  // trust from the form: the re-read has to happen first.
  it('will not create a club that has not been verified', async () => {
    const user = setup([impostor])
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Vérifier et décider' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Accepter' })).toBeDisabled()
    // Refusing needs no verification — there is nothing to write.
    expect(within(dialog).getByRole('button', { name: 'Refuser' })).toBeEnabled()
  })

  it('refuses with the note, and writes nothing else', async () => {
    const user = setup([impostor])
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Vérifier et décider' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Motif/), 'Ne correspond pas à la FFTT.')
    await user.click(within(dialog).getByRole('button', { name: 'Refuser' }))

    const [id, decision] = api.decideClubAdminRequest.mock.calls[0]
    expect(id).toBe('r-imp')
    expect(decision).toEqual({ status: 'rejected', note: 'Ne correspond pas à la FFTT.' })
  })

  it('reports a club FFTT has never heard of', async () => {
    const user = setup([impostor])
    api.fetchClubDetailXmlFromBrowser.mockResolvedValue('<liste></liste>')
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Vérifier et décider' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Vérifier maintenant' }))
    expect(await within(dialog).findByText(/ne connaît aucun club/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Accepter' })).toBeDisabled()
  })

  // The copy has to keep pace with the flow: it used to promise nobody was
  // told, which stopped being true when the decision e-mails landed.
  it('says who the decision will be sent to', async () => {
    const user = setup([honest])
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Vérifier et décider' }))
    expect(
      within(screen.getByRole('dialog')).getByText(/envoyée par e-mail au demandeur et à l’adresse du club/),
    ).toBeInTheDocument()
  })
})
