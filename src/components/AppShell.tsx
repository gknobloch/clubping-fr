import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

const prNumber = __PR_NUMBER__
const commitSha = __COMMIT_SHA__

function PreviewBanner() {
  if (!prNumber) return null
  const shortSha = commitSha ? commitSha.slice(0, 7) : ''
  return (
    <div className="bg-amber-500 text-white text-xs text-center py-1 px-4 font-medium">
      Preview — PR #{prNumber}{shortSha ? ` · ${shortSha}` : ''}
    </div>
  )
}

const navLinkClass = (active: boolean) =>
  `text-sm font-medium ${active ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'}`

export function AppShell() {
  const { user, displayName, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isGeneralAdmin = user?.role === 'general_admin'
  const isClubAdmin = user?.role === 'club_admin'

  const handleLogout = () => {
    if (window.confirm('Se déconnecter ?')) {
      logout()
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <PreviewBanner />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="font-display text-lg font-semibold text-slate-800">
            Ping Club
          </Link>
          <nav className="flex items-center gap-4">
            <Link to="/" className={navLinkClass(location.pathname === '/')}>
              Accueil
            </Link>
            {isGeneralAdmin && (
              <>
                <Link to="/clubs" className={navLinkClass(location.pathname === '/clubs')}>
                  Clubs
                </Link>
                <Link to="/saisons" className={navLinkClass(location.pathname === '/saisons')}>
                  Saisons
                </Link>
                <Link to="/phases" className={navLinkClass(location.pathname === '/phases')}>
                  Phases
                </Link>
                <Link to="/divisions" className={navLinkClass(location.pathname === '/divisions')}>
                  Divisions
                </Link>
                <Link to="/groupes" className={navLinkClass(location.pathname === '/groupes')}>
                  Groupes
                </Link>
                <Link to="/equipes" className={navLinkClass(location.pathname === '/equipes')}>
                  Équipes
                </Link>
                <Link to="/journees" className={navLinkClass(location.pathname === '/journees')}>
                  Journées
                </Link>
              </>
            )}
            {(isClubAdmin || user?.role === 'player') && !isGeneralAdmin && (
              <>
                {user?.clubId ? (
                  <Link to="/club" className={navLinkClass(location.pathname === '/club')}>
                    Club
                  </Link>
                ) : null}
                <Link to="/equipes" className={navLinkClass(location.pathname === '/equipes')}>
                  Équipes
                </Link>
                <Link to="/journees" className={navLinkClass(location.pathname === '/journees')}>
                  Journées
                </Link>
                <Link to="/joueurs" className={navLinkClass(location.pathname === '/joueurs')}>
                  Joueurs
                </Link>
              </>
            )}
            {isGeneralAdmin && (
              <Link to="/joueurs" className={navLinkClass(location.pathname === '/joueurs')}>
                Joueurs
              </Link>
            )}
            <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
              <Link to="/compte" className="hidden text-right sm:block" title="Mon compte">
                <p className="text-sm font-medium text-slate-800 hover:text-accent-600">{displayName}</p>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                title="Se déconnecter"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {user ? <Outlet /> : null}
      </main>
    </div>
  )
}
