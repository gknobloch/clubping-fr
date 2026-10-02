import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Un modal tourne avec le téléphone (#625)
//
// Sur un iPhone, iOS présente un `Modal` **en portrait seul** si on ne lui
// passe pas `supportedOrientations` — alors que l'app, elle, tourne
// (`orientation: default`, #445). Ouvrir une feuille téléphone couché
// redressait donc l'écran sous les mains du membre. Invisible à tout test de
// rendu : la prop est lue par UIKit, pas par React. D'où une lecture des
// sources, comme pour `flexShrink` dans une feuille.
//
// La règle : tout `<Modal` de l'app passe `MODAL_ORIENTATIONS`. Le plus simple
// pour la tenir reste de passer par `Sheet`, qui le fait.
// ---------------------------------------------------------------------------

const ROOTS = ['app', 'components'].map((dir) => path.join(__dirname, '..', dir))

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(full)
  }
  return out
}

/**
 * Each `<Modal …>` opening tag, attributes included. Scanned rather than
 * matched: an attribute such as `onRequestClose={() => close()}` holds a `>`
 * of its own, which only brace depth tells from the tag's.
 */
function modalTags(source: string): string[] {
  const tags: string[] = []
  for (const m of source.matchAll(/<Modal\b/g)) {
    let depth = 0
    let i = m.index! + m[0].length
    for (; i < source.length; i++) {
      const c = source[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    tags.push(source.slice(m.index, i + 1))
  }
  return tags
}

it('fait tourner tout modal avec le téléphone', () => {
  const offenders: string[] = []
  let seen = 0

  for (const file of ROOTS.flatMap((root) => sourceFiles(root))) {
    for (const tag of modalTags(readFileSync(file, 'utf8'))) {
      seen++
      if (!/supportedOrientations=\{MODAL_ORIENTATIONS\}/.test(tag)) {
        offenders.push(path.relative(path.join(__dirname, '..'), file))
      }
    }
  }

  // A regex that stopped matching anything would pass on nothing.
  expect(seen).toBeGreaterThan(0)
  expect(offenders).toEqual([])
})
