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
import { CompetitionsPage } from '@/pages/admin/CompetitionsPage'
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
import { JoinPage } from '@/pages/JoinPage'
import { ConfirmRequestPage } from '@/pages/ConfirmRequestPage'
import { RequestsPage } from '@/pages/admin/RequestsPage'
import { DeleteAccountPage } from '@/pages/DeleteAccountPage'

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
          {/* Public like the policy pages, and for a stronger reason: this is
              the only way in for a club the app has never heard of, whose
              correspondent has no account and cannot obtain one (#474). */}
          <Route path="/rejoindre" element={<JoinPage />} />
          {/* The club's confirmation step. Public because a correspondent has
              no account: the token in the link is their authorisation (#474). */}
          <Route path="/confirmer-demande" element={<ConfirmRequestPage />} />
          <Route path="/confidentialite" element={<PrivacyPage />} />
          {/* Public for the same reason, and for one more: Google Play prints
              this URL on the listing, and a member who can no longer sign in
              still has to be able to read how to leave (#434). */}
          <Route path="/suppression-compte" element={<DeleteAccountPage />} />
          <Route path="/" element={<ProtectedLayout />}>
            <Route index element={<HomePage />} />
            <Route path="clubs" element={<ClubsPage />} />
            <Route path="clubs/:clubId" element={<ClubDetailPage />} />
            <Route path="demandes" element={<RequestsPage />} />
            <Route path="saisons" element={<SeasonsPage />} />
            <Route path="phases" element={<PhasesPage />} />
            <Route path="divisions" element={<DivisionsPage />} />
            <Route path="competitions" element={<CompetitionsPage />} />
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
