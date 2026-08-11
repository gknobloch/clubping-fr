import { Stack } from 'expo-router'
import { colors } from '@/constants/colors'
import { accountHeaderRight } from '@/components/AccountHeaderButton'
import { displayFonts } from '@/constants/typography'

export default function EquipesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontFamily: displayFonts.semiBold },
        headerRight: accountHeaderRight,
        headerBackTitle: '',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Équipes' }} />
    </Stack>
  )
}
