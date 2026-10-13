import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Delegations, User } from '@/types'
import { PersonDelegates } from './PersonDelegates'

// #655 — delegations, on « Mon compte » and on the general admin's fiche. Who
// may is the API's (functions/api/delegation.test.ts); here, the screen.

const auth = vi.hoisted(() => ({ refreshProfiles: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))

const data = vi.hoisted(() => ({
  users: [] as User[],
  delegations: { delegates: [], represents: [] } as Delegations,
  fetchDelegations: vi.fn(),
  addDelegate: vi.fn(),
  removeDelegate: vi.fn(),
}))
vi.mock('@/contexts/DataContext', () => ({ useAppData: () => data }))

beforeEach(() => {
  data.users = []
  data.delegations = { delegates: [], represents: [] }
  data.fetchDelegations.mockReset().mockImplementation(async () => data.delegations)
  data.addDelegate.mockReset()
  data.removeDelegate.mockReset().mockResolvedValue(true)
  auth.refreshProfiles.mockReset()
})

describe('PersonDelegates — « Mon compte »', () => {
  it('names a delegate by address', async () => {
    data.addDelegate.mockResolvedValue({ ok: true, delegate: { id: 'person-benjamin', firstName: 'Benjamin' } })
    const user = userEvent.setup()
    render(<PersonDelegates personId="person-sacha" mode="self" idPrefix="t" />)
    await user.click(await screen.findByRole('button', { name: 'Ajouter un délégué' }))
    await user.type(screen.getByLabelText('Adresse e-mail du délégué'), 'henaut@example.fr')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(data.addDelegate).toHaveBeenCalledWith('person-sacha', { email: 'henaut@example.fr' })
    expect(data.fetchDelegations).toHaveBeenCalledTimes(2)
  })

  it("says the API's refusal and keeps what was typed", async () => {
    data.addDelegate.mockResolvedValue({ ok: false, message: "Aucun compte n'utilise cette adresse." })
    const user = userEvent.setup()
    render(<PersonDelegates personId="person-sacha" mode="self" idPrefix="t" />)
    await user.click(await screen.findByRole('button', { name: 'Ajouter un délégué' }))
    await user.type(screen.getByLabelText('Adresse e-mail du délégué'), 'inconnu@example.fr')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Aucun compte n'utilise cette adresse.")
    expect(screen.getByLabelText('Adresse e-mail du délégué')).toHaveValue('inconnu@example.fr')
  })

  it('lets a delegate step down, and asks the switcher again', async () => {
    data.delegations = { delegates: [], represents: [{ id: 'person-sacha', firstName: 'Sacha', lastName: 'Henaut' }] }
    const user = userEvent.setup()
    render(<PersonDelegates personId="person-benjamin" mode="self" idPrefix="t" />)
    await user.click(await screen.findByRole('button', { name: 'Ne plus gérer' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ne plus gérer' }))
    await waitFor(() => expect(auth.refreshProfiles).toHaveBeenCalled())
    expect(data.removeDelegate).toHaveBeenCalledWith('person-sacha', 'person-benjamin')
  })
})

describe('PersonDelegates — the general admin, on a fiche', () => {
  it('picks a member, once per person, never the person themselves', async () => {
    data.users = [
      { id: 'b-rix', personId: 'person-benjamin', role: 'player', isPlayer: true, firstName: 'Benjamin', lastName: 'Henaut' },
      { id: 'b-lan', personId: 'person-benjamin', role: 'player', isPlayer: true, firstName: 'Benjamin', lastName: 'Henaut' },
      { id: 'sacha', personId: 'person-sacha', role: 'player', isPlayer: true, firstName: 'Sacha', lastName: 'Henaut' },
    ]
    data.addDelegate.mockResolvedValue({ ok: true, delegate: { id: 'person-benjamin' } })
    const user = userEvent.setup()
    render(<PersonDelegates personId="person-sacha" mode="admin" idPrefix="t" />)
    await user.click(await screen.findByRole('button', { name: 'Ajouter un délégué' }))
    await user.type(screen.getByLabelText('Rechercher un membre'), 'Henaut')
    const offered = screen.getAllByRole('button', { name: /Henaut/ })
    expect(offered).toHaveLength(1)
    await user.click(offered[0])
    expect(data.addDelegate).toHaveBeenCalledWith('person-sacha', { delegateId: 'person-benjamin' })
  })
})
