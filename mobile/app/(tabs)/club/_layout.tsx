import { Stack } from 'expo-router'
import { AppHeader, appHeader } from '@/components/AppHeader'

export default function ClubLayout() {
  return (
    <Stack screenOptions={{ header: appHeader }}>
      <Stack.Screen name="index" options={{ title: 'Club' }} />
      {/* The FFTT import brings the club's licensees in as a whole, so it hangs
          off the club (#602) — it used to be pushed onto the Joueurs stack
          (#555). Pushed here rather than given a tab: the back chevron must
          land on the club. */}
      {/* A group's members, opened from this tab (#602). Pushed onto the Club
          stack so the chevron comes back here, and titled after where it came
          from: a group is the club's way of sorting its people. */}
      <Stack.Screen
        name="membres"
        options={{ title: 'Club', header: () => <AppHeader title="Club" showBack /> }}
      />
      <Stack.Screen
        name="import"
        options={{ title: 'Importer', header: () => <AppHeader title="Importer" showBack /> }}
      />
    </Stack>
  )
}
