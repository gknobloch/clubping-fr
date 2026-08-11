import { Stack } from 'expo-router'
import { colors } from '@/constants/colors'
import { displayFonts } from '@/constants/typography'

export default function EquipesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontFamily: displayFonts.semiBold },
        headerBackTitle: '',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Équipes' }} />
    </Stack>
  )
}
