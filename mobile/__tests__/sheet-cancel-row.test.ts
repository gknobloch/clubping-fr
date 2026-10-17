import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Le bouton « Annuler / Fermer » d'une feuille est posé dans sa rangée
//
// `selection.cancelBtn` déclare `flex: 1` : dans `selection.actions`, une
// rangée, c'est « prends la largeur ». Posé seul dans la colonne de la
// feuille, c'est « hauteur à partir de zéro » : il ne reste que le padding, et
// le libellé est rogné — un bouton gris vide au pied de la feuille. Vu sur
// « Partager le match » (#747), copié de « Changer de profil », qui l'avait
// depuis #640. Invisible à tout test de rendu, jest n'ayant pas de moteur de
// mise en page : d'où une lecture des sources.
// ---------------------------------------------------------------------------

const COMPONENTS = path.join(__dirname, '..', 'components')

function componentFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) componentFiles(full, out)
    else if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(full)
  }
  return out
}

it('puts every selection.cancelBtn inside a selection.actions row', () => {
  const offenders: string[] = []
  for (const file of componentFiles(COMPONENTS)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (!line.includes('style={selection.cancelBtn}')) return
      const above = lines.slice(0, i).reverse().find((l) => l.trim() !== '')
      if (!above?.includes('selection.actions')) {
        offenders.push(`${path.relative(COMPONENTS, file)}:${i + 1}`)
      }
    })
  }
  expect(offenders).toEqual([])
})
