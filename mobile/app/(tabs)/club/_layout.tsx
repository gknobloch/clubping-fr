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
      <Stack.Screen
        name="import"
        options={{ title: 'Importer', header: () => <AppHeader title="Importer" showBack /> }}
      />
    </Stack>
  )
}
