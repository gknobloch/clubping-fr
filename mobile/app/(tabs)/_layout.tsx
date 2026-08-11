import type { ComponentProps } from 'react'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { TabBar } from '@/components/TabBar'
import { AppHeader, appHeader } from '@/components/AppHeader'
import { useAuth } from '@/contexts/AuthContext'

type IconName = ComponentProps<typeof Ionicons>['name']

// Monochrome tab icons, tinted by the active/inactive tab color.
function tabIcon(name: IconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  )
}

// ---------------------------------------------------------------------------
// Tab order mirrors the web's navigation for a player or club admin (#365):
//
//   Accueil · Club · Équipes · Journées · Joueurs
//
// Compte is deliberately not a sixth tab — it lives in the header, behind the
// member's avatar, exactly as on the web (src/components/AppShell.tsx).
// ---------------------------------------------------------------------------
export default function TabLayout() {
  const { user } = useAuth()
  // No club, no Club tab. Same condition as the web link, which a general
  // admin (who belongs to no club) never sees either.
  const hasClub = !!user?.clubId

  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <TabBar {...props} />}
      // One header for the whole app — the section stacks render the same
      // component, so the bar does not shift from one tab to the next (#365).
      screenOptions={{ header: appHeader }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Accueil', tabBarIcon: tabIcon('home-outline') }}
      />
      <Tabs.Screen
        name="club"
        options={{
          title: 'Club',
          href: hasClub ? undefined : null,
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
