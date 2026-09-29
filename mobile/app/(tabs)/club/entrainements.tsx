import TrainingsScreen from '@/app/(tabs)/entrainements'

// Les séances d'une série, ouvertes depuis l'onglet Club (#608) : la liste de
// l'onglet Entraînements elle-même, poussée sur la pile du Club pour que le
// retour y ramène et que l'onglet Club reste allumé — comme `club/membres`.
export default function ClubTrainingsScreen() {
  return <TrainingsScreen />
}
