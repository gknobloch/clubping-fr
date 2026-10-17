import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// « Ajouter à mon agenda » passe par `expo-calendar/legacy` (#751)
//
// Depuis Expo SDK 57 (#589), la racine d'`expo-calendar` exporte encore
// `createEventInCalendarAsync`, mais comme un bouchon qui lève toujours : sur un
// téléphone, chaque toucher répondait « Impossible d'ouvrir le calendrier du
// téléphone », pour un match comme pour une séance, des versions 1.5.0 à 1.8.0.
// Les tests ne le voyaient pas : ils remplacent le module entier par un faux.
// D'où une lecture des sources — l'API de la racine demande un calendrier,
// donc la permission que l'app refuse exprès (#418), et n'a rien à faire ici.
// ---------------------------------------------------------------------------

const ROOT = path.join(__dirname, '..')
const DIRS = ['app', 'components', 'contexts', 'utils']

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) sources(full, out)
    else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) out.push(full)
  }
  return out
}

it('never imports the root of expo-calendar, whose old methods always throw', () => {
  const offenders = DIRS
    .flatMap((d) => sources(path.join(ROOT, d)))
    .filter((f) => /from ['"]expo-calendar['"]|require\(['"]expo-calendar['"]\)/.test(readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f))
  expect(offenders).toEqual([])
})
