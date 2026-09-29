import TrainingsScreen from '@/app/(tabs)/entrainements'

// ---------------------------------------------------------------------------
// Les séances, en écran poussé depuis l'accueil (#608)
//
// « Tous les entraînements » poussait `/entrainements`, ce qui changeait
// d'onglet : un onglet est une racine, donc la liste s'affichait sans retour
// vers l'accueil d'où l'on venait. Ici, la même liste est poussée sur la pile
// `(detail)`, avec son chevron — comme les membres d'un groupe (#602). C'est
// l'écran de l'onglet lui-même, pas une copie.
// ---------------------------------------------------------------------------
export default function PushedTrainingsScreen() {
  return <TrainingsScreen />
}
