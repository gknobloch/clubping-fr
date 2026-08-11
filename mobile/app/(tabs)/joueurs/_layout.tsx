import { Stack } from 'expo-router'
import { colors } from '@/constants/colors'
import { displayFonts } from '@/constants/typography'

export default function JoueursLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontFamily: displayFonts.semiBold },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Joueurs' }} />
    </Stack>
  )
}
