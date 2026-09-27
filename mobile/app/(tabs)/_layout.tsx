import type { ColorValue } from 'react-native'
import type { ComponentProps } from 'react'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { TabBar } from '@/components/TabBar'
import { AppHeader, appHeader } from '@/components/AppHeader'
import { useLayout } from '@/constants/layout'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'

type IconName = ComponentProps<typeof Ionicons>['name']

// Monochrome tab icons, tinted by the active/inactive tab color.
function tabIcon(name: IconName) {
  // `color` est un `ColorValue` depuis RN 0.86 — il peut être un
  // `OpaqueColorValue` (PlatformColor) et non plus seulement une chaîne.
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  )
}

// ---------------------------------------------------------------------------
// Tab order mirrors the web's navigation for a player or club admin (#365):
//
//   Accueil · Équipes · Journées · Entraînements · Joueurs
//
// Five, never six: at 390pt a sixth tab is 65pt wide, which cuts
// « Entraînements » to « Entraînem… », and both platforms cap a bottom bar at
// five. So Entraînements (#608) took Club's place rather than joining it — a
// member opens the trainings every week, the club's card now and then — and
// Club is reached from Mon compte instead.
//
// Compte is not a tab either — it lives in the header, behind the member's
// avatar, exactly as on the web (src/components/AppShell.tsx).
// ---------------------------------------------------------------------------
export default function TabLayout() {
  const { user } = useAuth()
  // No club, no Club tab. Same condition as the web link, which a general
  // admin (who belongs to no club) never sees either.
  const hasClub = !!user?.clubId
  // A club that publishes no training gets no Entraînements tab: a destination
  // that is always empty is a question nobody can answer.
  const { trainings } = useAppData()
  const hasTrainings = hasClub && trainings.some((t) => t.clubId === user?.clubId)
  // A slab held sideways puts the menu down the left edge instead of across
  // the foot (#447). This one option is the whole navigator-side change: it
  // flips the container to a row and renders the tab bar before the screens,
  // and `TabBar` reads the same rule to draw itself as a rail.
  const { hasSideRail } = useLayout()

  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <TabBar {...props} />}
      // One header for the whole app — the section stacks render the same
      // component, so the bar does not shift from one tab to the next (#365).
      screenOptions={{ header: appHeader, tabBarPosition: hasSideRail ? 'left' : 'bottom' }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Accueil', tabBarIcon: tabIcon('home-outline') }}
      />
      {/* Off the bar since #608, reached from Mon compte — see the order
          above. Hidden like Compte rather than unregistered, so
          router.push('/club') still resolves. */}
      <Tabs.Screen
        name="club"
        options={{
          title: 'Club',
          // A stack since #602, which draws its own header like the other
          // section stacks.
          headerShown: false,
          href: hasClub ? undefined : null,
          tabBarItemStyle: { display: 'none' },
          tabBarIcon: tabIcon('business-outline'),
        }}
      />
      <Tabs.Screen
        name="equipes"
        options={{ title: 'Équipes', headerShown: false, tabBarIcon: tabIcon('people-outline') }}
      />
      <Tabs.Screen
        name="journees"
        options={{ title: 'Journées', headerShown: false, tabBarIcon: tabIcon('calendar-outline') }}
      />
      {/* Hidden, never unregistered, for a club without trainings: a push
          notification can open it on a cold start before the data that says
          whether the club has any has arrived (#608). */}
      <Tabs.Screen
        name="entrainements"
        options={{
          title: 'Entraînements',
          headerShown: false,
          tabBarIcon: tabIcon('barbell-outline'),
          ...(hasTrainings ? {} : { tabBarItemStyle: { display: 'none' } }),
        }}
      />
      <Tabs.Screen
        name="joueurs"
        options={{ title: 'Joueurs', headerShown: false, tabBarIcon: tabIcon('person-outline') }}
      />
      {/* Reached from the header avatar, so it is hidden from the tab bar —
          and shows no avatar of its own, being where that avatar leads.
          Hidden via tabBarItemStyle, NOT href:null: href:null unregisters the
          route, and router.push('/compte') then falls through to the OS as an
          external URL — Safari, "address is invalid". Our TabBar skips items
          with display:'none' (the same check that hides the (detail) stack). */}
      <Tabs.Screen
        name="compte"
        options={{
          title: 'Compte',
          tabBarItemStyle: { display: 'none' },
          // No avatar here: this screen is where it leads.
          header: () => <AppHeader title="Compte" showAccount={false} />,
        }}
      />
      {/* Shared detail screens (player, team, match, match list) — a hidden tab
          hosting a Stack, so the tab bar stays visible while drilling in (#153). */}
      <Tabs.Screen name="(detail)" options={{ href: null, headerShown: false }} />
    </Tabs>
  )
}
