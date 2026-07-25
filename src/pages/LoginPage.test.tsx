import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  it('renders the email sign-in step', () => {
    render(<LoginPage />)
    expect(screen.getByRole('heading', { name: /Ping Club/i })).toBeInTheDocument()
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
