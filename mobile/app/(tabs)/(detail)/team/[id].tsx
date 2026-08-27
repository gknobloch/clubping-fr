import { useLocalSearchParams } from 'expo-router'
import { TeamDetail } from '@/components/TeamDetail'

// The fiche équipe as a pushed screen — what a phone always gets, and what a
// tablet still gets for a team that is not in the list beside it (an opponent
// reached from a match, say). The screen itself is `TeamDetail`, which the
// Équipes tab also renders in place, in the right-hand pane (#447).
export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <TeamDetail teamId={id} />
}
