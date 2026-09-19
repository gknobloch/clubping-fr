import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useLayout } from '@/constants/layout'

// ---------------------------------------------------------------------------
// Ouvrir une fiche depuis ailleurs (#585)
//
// Au-dessus du seuil tablette, une fiche s'ouvre **à côté de sa liste**, dans
// la section à qui elle appartient. En deçà, elle est poussée — il n'y a pas de
// liste à côté de laquelle atterrir, et c'est exactement ce que sert la pile
// `(detail)`.
//
// La règle tient en quatre lignes, ce qui est précisément pourquoi elle doit
// vivre à un seul endroit : elle était écrite à trois sites d'appel, chacun
// poussant `/team/:id` quelle que soit la largeur, et c'est ce que #582 décrit.
//
// À ne pas confondre avec la sélection *à l'intérieur* d'une section, qui se
// pose en place (`usePaneSelection`, `setParams`) et n'empile rien : ici on
// vient d'ailleurs, donc il y a bien une navigation à faire.
// ---------------------------------------------------------------------------

export function useOpenTeam() {
  const router = useRouter()
  const { isTwoPane } = useLayout()

  return useCallback(
    (teamId: string) => {
      if (isTwoPane) router.push({ pathname: '/equipes', params: { selected: teamId } })
      else router.push(`/team/${teamId}`)
    },
    [router, isTwoPane],
  )
}
