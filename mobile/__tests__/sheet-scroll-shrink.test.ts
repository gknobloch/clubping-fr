import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Une liste qui défile dans une feuille doit pouvoir rétrécir
//
// `Sheet` plafonne son panneau (`maxHeight`). Une `ScrollView` posée dedans,
// avec un pied de page à côté d'elle, réclame toute la hauteur de son contenu
// et pousse ce pied **hors** du panneau, par-dessus le fond — parce que React
// Native met `flexShrink` à 0 par défaut, contrairement au web.
//
// Trouvé sur la feuille de composition d'un club à neuf équipes : « Ne pas
// aligner » dépassait sous le panneau. Invisible sur le club de démo, qui en a
// deux, et invisible à tout test de rendu : jest n'a pas de moteur de mise en
// page, donc rien ne calcule le débordement. D'où une lecture des sources.
//
// La règle : si un fichier monte une `ScrollView` stylée à côté d'autre chose
// dans une `Sheet`, ce style dit `flexShrink`.
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

/** The style name a `<ScrollView style={x.name}>` uses, if it has one. */
function scrollStyleNames(source: string): string[] {
  const names: string[] = []
  for (const m of source.matchAll(/<ScrollView[^>]*?\bstyle=\{(\w+)\.(\w+)\}/gs)) {
    names.push(m[2])
  }
  return names
}

/** Does the stylesheet entry of that name declare `flexShrink`? */
function declaresShrink(source: string, name: string): boolean {
  // `name: { … }` up to the closing brace of that entry.
  const entry = new RegExp(`\\b${name}:\\s*\\{[^}]*\\}`, 's').exec(source)
  return !!entry && /flexShrink\s*:/.test(entry[0])
}

it('laisse rétrécir toute liste défilante posée dans une feuille', () => {
  const offenders: string[] = []

  for (const file of componentFiles(COMPONENTS)) {
    const source = readFileSync(file, 'utf8')
    // Only the ones that actually sit in a `Sheet`: elsewhere a ScrollView is
    // the whole screen and has nothing to be pushed out of.
    if (!source.includes('<Sheet')) continue

    for (const name of scrollStyleNames(source)) {
      if (!declaresShrink(source, name)) {
        offenders.push(`${path.basename(file)} → styles.${name}`)
      }
    }
  }

  expect(offenders).toEqual([])
})
