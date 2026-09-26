import JoueursScreen from '@/app/(tabs)/joueurs'

// Les membres d'un groupe, ouverts depuis l'onglet Club (#602) : la liste des
// Joueurs elle-même, poussée sur la pile du Club pour que le retour y ramène
// et que l'onglet Club reste allumé. Depuis une fiche, c'est `(detail)/membres`.
export default function ClubGroupMembersScreen() {
  return <JoueursScreen />
}
