import JourneesScreen from '@/app/(tabs)/journees'

// ---------------------------------------------------------------------------
// Une journée, ouverte depuis l'accueil (#608)
//
// « Prochaines journées » ne menait nulle part. Chaque ligne ouvre maintenant
// l'écran des Journées sur la sienne (`?phase=…&journee=…`), poussé sur la pile
// `(detail)` avec son chevron — comme la liste des entraînements : un onglet est
// une racine, sans retour vers l'accueil. C'est l'écran de l'onglet lui-même,
// pas une copie ; l'onglet Journées reste allumé.
// ---------------------------------------------------------------------------
export default function PushedJourneesScreen() {
  return <JourneesScreen />
}
