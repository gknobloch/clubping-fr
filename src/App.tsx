import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { DataProvider } from '@/contexts/DataContext'
import { AppShell } from '@/components/AppShell'
import { ScrollToTop } from '@/components/ScrollToTop'
import { LoginPage } from '@/pages/LoginPage'
import { HomePage } from '@/pages/HomePage'
import { ClubsPage } from '@/pages/admin/ClubsPage'
import { ClubDetailPage } from '@/pages/admin/ClubDetailPage'
import { SeasonsPage } from '@/pages/admin/SeasonsPage'
import { PhasesPage } from '@/pages/admin/PhasesPage'
import { DivisionsPage } from '@/pages/admin/DivisionsPage'
import { GroupsPage } from '@/pages/admin/GroupsPage'
import { TeamsPage } from '@/pages/admin/TeamsPage'
import { PlayersPage } from '@/pages/admin/PlayersPage'
import { MatchDaysPage } from '@/pages/admin/MatchDaysPage'
import { MatchDayDetailPage } from '@/pages/MatchDayDetailPage'
import { MyClubPage } from '@/pages/MyClubPage'
import { PlayerDetailPage } from '@/pages/PlayerDetailPage'
import { TeamDetailPage } from '@/pages/TeamDetailPage'
import { ComptePage } from '@/pages/ComptePage'
import { PrivacyPage } from '@/pages/PrivacyPage'

function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-500">
      Chargement…
    </div>
  )
}

function ProtectedLayout() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <AuthLoading />
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <AppShell />
}

function PublicRoute() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <AuthLoading />
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }
  return <LoginPage />
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <DataProvider>
          <Routes>
          <Route path="/login" element={<PublicRoute />} />
          {/* Public and outside the auth guard on purpose: store reviewers fetch
              this URL anonymously (#356). */}
          <Route path="/confidentialite" element={<PrivacyPage />} />
          <Route path="/" element={<ProtectedLayout />}>
            <Route index element={<HomePage />} />
            <Route path="clubs" element={<ClubsPage />} />
            <Route path="clubs/:clubId" element={<ClubDetailPage />} />
            <Route path="saisons" element={<SeasonsPage />} />
            <Route path="phases" element={<PhasesPage />} />
            <Route path="divisions" element={<DivisionsPage />} />
            <Route path="groupes" element={<GroupsPage />} />
            <Route path="equipes" element={<TeamsPage />} />
            <Route path="equipes/:id" element={<TeamDetailPage />} />
            <Route path="joueurs" element={<PlayersPage />} />
            <Route path="joueurs/:id" element={<PlayerDetailPage />} />
            <Route path="journees" element={<MatchDaysPage />} />
            {/* Mobile entry point into a single match; renders at any width so a
                shared link works anywhere (#306). */}
            <Route path="journees/:gameId" element={<MatchDayDetailPage />} />
            <Route path="club" element={<MyClubPage />} />
            <Route path="compte" element={<ComptePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
