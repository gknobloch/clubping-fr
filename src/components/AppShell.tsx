import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { BrandMark } from '@/components/BrandMark'
import { COMMIT_SHA, IS_PR_PREVIEW, PR_NUMBER } from '@/lib/preview'
import { useConfirm } from '@/components/useConfirm'
import { OfflineBanner } from '@/components/OfflineBanner'

function PreviewBanner() {
  if (!IS_PR_PREVIEW) return null
  const shortSha = COMMIT_SHA ? COMMIT_SHA.slice(0, 7) : ''
  return (
    <div className="bg-amber-500 text-white text-xs text-center py-1 px-4 font-medium">
      Preview — PR #{PR_NUMBER}{shortSha ? ` · ${shortSha}` : ''}
    </div>
  )
}

const navLinkClass = (active: boolean) =>
  `text-sm font-medium ${active ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'}`

// Drawer rows are their own tap targets, so they carry the 44px minimum the
// desktop bar does not need (#307).
const drawerLinkClass = (active: boolean) =>
  `flex min-h-[44px] items-center rounded-lg px-3 text-base font-medium ${
    active ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
  }`

interface NavItem {
  to: string
  label: string
}

function LogoutIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export function AppShell() {
  const { user, displayName, logout } = useAuth()
  const [confirm, confirmDialog] = useConfirm()
  const location = useLocation()
  const navigate = useNavigate()
  const isGeneralAdmin = user?.role === 'general_admin'
  const isClubAdmin = user?.role === 'club_admin'
  const [menuOpen, setMenuOpen] = useState(false)

  // Same link sets as before, as data rather than two near-identical JSX
  // branches — the mobile drawer and the desktop bar render the one list.
  // A role that is neither admin nor player still gets Accueil only.
  const links: NavItem[] = [{ to: '/', label: 'Accueil' }]
  if (isGeneralAdmin) {
    links.push(
      { to: '/clubs', label: 'Clubs' },
      { to: '/saisons', label: 'Saisons' },
      { to: '/phases', label: 'Phases' },
      { to: '/divisions', label: 'Divisions' },
      { to: '/groupes', label: 'Groupes' },
      { to: '/equipes', label: 'Équipes' },
      { to: '/journees', label: 'Journées' },
      { to: '/joueurs', label: 'Joueurs' },
    )
  } else if (isClubAdmin || user?.role === 'player') {
    if (user?.clubId) links.push({ to: '/club', label: 'Club' })
    links.push(
      { to: '/equipes', label: 'Équipes' },
      { to: '/journees', label: 'Journées' },
      { to: '/joueurs', label: 'Joueurs' },
    )
  }

  // Navigating is what closes the drawer — clicking the link the user is
  // already on has to close it too, so this keys on the location object.
  useEffect(() => { setMenuOpen(false) }, [location])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const handleLogout = async () => {
    if (await confirm({ title: 'Se déconnecter ?', confirmLabel: 'Se déconnecter' })) {
      logout()
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {confirmDialog}
      <PreviewBanner />
      <OfflineBanner />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="relative mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            className={`flex min-h-11 items-center gap-2 whitespace-nowrap font-display text-lg font-semibold text-slate-800 md:min-h-0`}
          >
            <BrandMark className="h-7 w-7 shrink-0" />
            Club Ping
          </Link>

          {/* Desktop: the full bar. Below md it would overflow the viewport —
              nine links do not fit on a phone (#304). */}
          <nav className="hidden items-center gap-4 md:flex">
            {links.map((link) => (
              <Link key={link.to} to={link.to} className={navLinkClass(location.pathname === link.to)}>
                {link.label}
              </Link>
            ))}
            <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
              <Link to="/compte" className="text-right" title="Mon compte">
                <p className="text-sm font-medium text-slate-800 hover:text-accent-600">{displayName}</p>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                title="Se déconnecter"
                aria-label="Se déconnecter"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <LogoutIcon />
              </button>
            </div>
          </nav>

          {/* Mobile: everything above lives behind this button. */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            aria-controls="menu-mobile"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:hidden"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              {menuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <>
            {/* Tapping anywhere outside closes, without trapping focus. */}
            <div
              className="fixed inset-0 top-14 z-10 bg-slate-900/20 md:hidden"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <nav
              id="menu-mobile"
              className="relative z-20 border-t border-slate-200 bg-white px-3 py-2 shadow-lg md:hidden"
            >
              {links.map((link) => (
                <Link key={link.to} to={link.to} className={drawerLinkClass(location.pathname === link.to)}>
                  {link.label}
                </Link>
              ))}
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
                <Link to="/compte" className={`${drawerLinkClass(location.pathname === '/compte')} flex-1`}>
                  {displayName}
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Se déconnecter"
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <LogoutIcon />
                </button>
              </div>
            </nav>
          </>
        )}
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {user ? <Outlet /> : null}
      </main>
    </div>
  )
}
