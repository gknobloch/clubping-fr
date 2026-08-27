import { useLocalSearchParams } from 'expo-router'
import { PlayerDetail } from '@/components/PlayerDetail'

// La fiche joueur as a pushed screen — what a phone always gets, and what a
// tablet still gets for a licencié who is not in the list beside it (someone
// reached from a team's composition, say). The screen itself is `PlayerDetail`,
// which the Joueurs tab also renders in place, in the right-hand pane (#466).
export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <PlayerDetail playerId={id} />
}
