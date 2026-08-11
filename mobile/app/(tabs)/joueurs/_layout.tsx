import { Stack } from 'expo-router'
import { appHeader } from '@/components/AppHeader'

export default function JoueursLayout() {
  return (
    <Stack screenOptions={{ header: appHeader }}>
      <Stack.Screen name="index" options={{ title: 'Joueurs' }} />
    </Stack>
  )
}
