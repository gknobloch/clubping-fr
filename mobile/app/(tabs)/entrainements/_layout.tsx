import { Stack } from 'expo-router'
import { appHeader } from '@/components/AppHeader'

// A stack like the other sections, so the tab draws the app's one header and
// has somewhere to push onto later.
export default function TrainingsLayout() {
  return (
    <Stack screenOptions={{ header: appHeader }}>
      <Stack.Screen name="index" options={{ title: 'Entraînements' }} />
    </Stack>
  )
}
