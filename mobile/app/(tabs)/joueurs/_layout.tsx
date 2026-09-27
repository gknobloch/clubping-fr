import { Stack } from 'expo-router'
import { AppHeader, appHeader } from '@/components/AppHeader'

export default function JoueursLayout() {
  return (
    <Stack screenOptions={{ header: appHeader }}>
      <Stack.Screen name="index" options={{ title: 'Joueurs' }} />
      {/* Pushed onto the Joueurs stack rather than given a tab: it is a task
          about this roster, and the back chevron must land on it (#555). */}
      <Stack.Screen
        name="import"
        options={{ title: 'Importer', header: () => <AppHeader title="Importer" showBack /> }}
      />
    </Stack>
  )
}
