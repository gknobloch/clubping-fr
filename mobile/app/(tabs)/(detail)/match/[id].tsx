import { useLocalSearchParams } from 'expo-router'
import { MatchDetail } from '@/components/MatchDetail'

// Le détail d'un match comme écran poussé — ce qu'un téléphone obtient partout,
// et ce qu'une tablette obtient pour un match qui n'est pas dans la liste à
// côté (depuis l'accueil, une notification, la matrice). L'écran lui-même est
// `MatchDetail`, que « Tous les matchs de cette équipe » rend aussi en place,
// dans son volet droit (#585).
export default function MatchDetailScreen() {
  const { id, teamId, from } = useLocalSearchParams<{
    id: string; teamId: string; from?: string
  }>()
  return <MatchDetail gameId={id} teamId={teamId} from={from} />
}
