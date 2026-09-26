import JoueursScreen from '@/app/(tabs)/joueurs'

// ---------------------------------------------------------------------------
// Les membres d'un groupe, en écran poussé (#602)
//
// Un groupe s'ouvre sur la liste des joueurs déjà filtrée. Pousser `/joueurs`
// changeait d'onglet : la liste s'affichait, mais sans retour vers la fiche ou
// l'onglet Club d'où l'on venait — un onglet est une racine, il n'a rien
// derrière lui.
//
// Ici, la même liste est poussée sur la pile `(detail)`, avec son chevron :
// le retour ramène à la fiche (poussée sur la même pile), ou à l'onglet Club
// (`backBehavior="history"`). C'est l'écran des Joueurs lui-même et non une
// copie : il lit ses filtres dans les paramètres de la route (`?groupes=`),
// et ceux-ci sont les siens.
// ---------------------------------------------------------------------------
export default function GroupMembersScreen() {
  return <JoueursScreen />
}
