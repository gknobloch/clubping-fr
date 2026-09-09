// ---------------------------------------------------------------------------
// Store release notes (#492)
//
// `eas submit` uploads a binary and no text at all, so every release used to be
// three copy-pastes out of mobile/CHANGELOG.md: "Nouveautés de cette version"
// on the App Store, "Éléments à tester" in TestFlight, "Notes de version" in
// the Play Console. This turns that file into the three of them.
//
// The CHANGELOG stays the source: it is written in French from the member's
// side and reviewed in the version-bump PR. Nothing here rewrites it — the
// script only unwraps the markdown into what a store field renders, and refuses
// to ship text that would not fit.
//
// It lives in scripts/ rather than mobile/ so the repo's Vitest already covers
// it (`scripts/**/*.test.ts` in vite.config.ts). mobile/ has its own Jest around
// the React Native runtime, which this needs none of.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// What each store accepts. The App Store's 4 000 is roomy; Play's 500 is the
// one that bites, and it is why a version can carry its own shorter text.
export const APP_STORE_LIMIT = 4000
export const PLAY_LIMIT = 500

/**
 * Cut the changelog into its version sections.
 *
 * A section is `## <version> — <date>` and everything up to the next `##`.
 * `## À paraître` parses too, with a null version: it is a real section that
 * simply has no number yet, and calling it a parse error would make the file
 * unreadable for most of its life.
 *
 * @param {string} markdown
 * @returns {{version: string|null, heading: string, blocks: Block[], play: Block[]|null}[]}
 */
export function parseChangelog(markdown) {
  const sections = []
  let current = null
  let sink = null

  for (const line of markdown.split('\n')) {
    const h2 = /^##\s+(.*\S)\s*$/.exec(line)
    if (h2) {
      const heading = h2[1]
      const numbered = /^(\d+\.\d+\.\d+)\s+—\s+(.+)$/.exec(heading)
      current = {
        version: numbered ? numbered[1] : null,
        heading,
        blocks: [],
        play: null,
      }
      sink = current.blocks
      sections.push(current)
      continue
    }
    if (!current) continue // the file's own preamble, before the first section

    // A `### Play` subsection is the version's own short form, for the field
    // that only takes 500 characters. Anything else at h3 is prose about the
    // release and stays in the main body.
    const h3 = /^###\s+(.*\S)\s*$/.exec(line)
    if (h3) {
      if (/^play$/i.test(h3[1])) {
        current.play = []
        sink = current.play
      } else {
        sink = current.blocks
      }
      continue
    }
    appendLine(sink, line)
  }

  return sections
}

/** @typedef {{type: 'paragraph'|'bullet', lines: string[]}} Block */

/**
 * Add one raw markdown line to a section's blocks.
 *
 * The CHANGELOG is hard-wrapped at ~80 columns, so a bullet is usually several
 * lines. Continuation lines belong to the block above them; a blank line ends
 * whatever was open.
 *
 * @param {Block[]} blocks
 * @param {string} line
 */
function appendLine(blocks, line) {
  if (!line.trim()) {
    if (blocks.length) blocks[blocks.length - 1].closed = true
    return
  }
  const bullet = /^[-*]\s+(.*)$/.exec(line.trim())
  const open = blocks.length && !blocks[blocks.length - 1].closed ? blocks[blocks.length - 1] : null
  if (bullet) {
    blocks.push({ type: 'bullet', lines: [bullet[1]] })
  } else if (open) {
    open.lines.push(line.trim())
  } else {
    blocks.push({ type: 'paragraph', lines: [line.trim()] })
  }
}

/**
 * Render blocks as a store field renders them: no markdown, no hard wraps.
 *
 * Store fields are plain text. `**gras**` shows its asterisks, and the
 * CHANGELOG's 80-column wrapping shows as line breaks mid-sentence — both are
 * artefacts of a file meant to be read in an editor, not on a store page.
 *
 * @param {Block[]} blocks
 * @returns {string}
 */
export function renderBlocks(blocks) {
  const out = []
  blocks.forEach((block, i) => {
    const text = plainText(block.lines.join(' '))
    // Bullets run together as a list; anything else gets air around it.
    const previous = blocks[i - 1]
    if (previous && !(previous.type === 'bullet' && block.type === 'bullet')) out.push('')
    out.push(block.type === 'bullet' ? `• ${text}` : text)
  })
  return out.join('\n').trim()
}

/**
 * Strip the markdown a store field cannot render.
 * @param {string} text
 */
function plainText(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The three fields, for one version section.
 *
 * App Store and TestFlight take the whole section. Play takes the `### Play`
 * short form when the version has one, and the whole section when it does not —
 * a short release fits, and asking for a second copy of the same three lines
 * would only invite the two to drift.
 *
 * @param {{version: string|null, blocks: Block[], play: Block[]|null}} section
 * @returns {{appStore: string, testflight: string, play: string}}
 */
export function notesForSection(section) {
  const full = renderBlocks(section.blocks)
  return {
    appStore: full,
    testflight: full,
    play: section.play ? renderBlocks(section.play) : full,
  }
}

/**
 * Refuse text a store would reject or silently cut.
 *
 * Truncating here would be worse than failing: Play's limit lands in the middle
 * of a sentence, and neither field can be corrected after release without
 * another submission.
 *
 * @param {{appStore: string, play: string}} notes
 * @param {string} version
 */
export function checkLimits(notes, version) {
  const problems = []
  const count = (text) => [...text].length
  if (count(notes.appStore) > APP_STORE_LIMIT) {
    problems.push(
      `Nouveautés de cette version (App Store) : ${count(notes.appStore)} caractères, ` +
        `maximum ${APP_STORE_LIMIT}. Raccourcissez la section ${version} du CHANGELOG.`,
    )
  }
  if (count(notes.play) > PLAY_LIMIT) {
    problems.push(
      `Notes de version (Play) : ${count(notes.play)} caractères, maximum ${PLAY_LIMIT}. ` +
        `Ajoutez une sous-section « ### Play » à la version ${version} du CHANGELOG : ` +
        `le texte court que Play affichera, à écrire plutôt qu'à couper.`,
    )
  }
  if (!notes.appStore.trim()) {
    problems.push(`La section ${version} du CHANGELOG est vide.`)
  }
  return problems
}

/**
 * Find the version's section, by number.
 * @param {ReturnType<typeof parseChangelog>} sections
 * @param {string} version
 */
export function sectionForVersion(sections, version) {
  const found = sections.find((s) => s.version === version)
  if (!found) {
    throw new Error(
      `Aucune section « ## ${version} » dans mobile/CHANGELOG.md. ` +
        `La release renomme « ## À paraître » en « ## ${version} — <date> » ; ` +
        `c'est cette étape qui manque.`,
    )
  }
  return found
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * Ask EAS which build carries this version.
 *
 * Not `eas build:version:get`: that returns the last number EAS handed out,
 * which before a build is the *previous* release's. A changelog file named for
 * a versionCode that is not the one being promoted makes `supply` upload no
 * notes at all, without an error — so the number is read off a real finished
 * build of this exact version, and its absence is the answer to "have you
 * built yet?".
 *
 * @param {string} platform 'android' | 'ios'
 * @param {string} version
 */
function buildVersionFromEas(platform, version) {
  const raw = execFileSync(
    'npx',
    ['--no-install', 'eas', 'build:list', '--platform', platform, '--limit', '30', '--json', '--non-interactive'],
    { cwd: path.join(ROOT, 'mobile'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
  const builds = JSON.parse(raw)
  const match = builds.find(
    (b) => b.status === 'FINISHED' && b.buildProfile === 'production' && b.appVersion === version,
  )
  if (!match) {
    throw new Error(
      `Aucun build production ${platform} terminé pour la version ${version}. ` +
        `Les notes se génèrent après le build, pas avant : c'est le build qui porte le numéro ` +
        `(versionCode / buildNumber) auquel elles seront attachées.`,
    )
  }
  return match.appBuildVersion
}

function write(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${contents}\n`, 'utf8')
  return path.relative(ROOT, file)
}

function main(argv) {
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`)
    return i === -1 ? undefined : argv[i + 1]
  }
  const check = argv.includes('--check')

  const appJson = JSON.parse(readFileSync(path.join(ROOT, 'mobile/app.json'), 'utf8'))
  const version = flag('version') ?? appJson.expo.version
  const sections = parseChangelog(readFileSync(path.join(ROOT, 'mobile/CHANGELOG.md'), 'utf8'))

  // --check validates every numbered section, not just the one shipping: a Play
  // overflow written today is worth catching in its own PR, not on release day.
  if (check) {
    const problems = sections
      .filter((s) => s.version)
      .flatMap((s) => checkLimits(notesForSection(s), s.version))
    if (problems.length) {
      console.error(problems.map((p) => `  ✗ ${p}`).join('\n'))
      process.exit(1)
    }
    console.log(`✓ ${sections.filter((s) => s.version).length} versions, notes dans les limites des stores.`)
    return
  }

  const section = sectionForVersion(sections, version)
  const notes = notesForSection(section)
  const problems = checkLimits(notes, version)
  if (problems.length) {
    console.error(problems.map((p) => `  ✗ ${p}`).join('\n'))
    process.exit(1)
  }

  const versionCode = flag('version-code') ?? buildVersionFromEas('android', version)
  const buildNumber = flag('build-number') ?? buildVersionFromEas('ios', version)

  const meta = path.join(ROOT, 'mobile/fastlane/metadata')
  const written = [
    write(path.join(meta, 'fr-FR/release_notes.txt'), notes.appStore),
    write(path.join(meta, 'fr-FR/testflight_notes.txt'), notes.testflight),
    write(path.join(meta, `android/fr-FR/changelogs/${versionCode}.txt`), notes.play),
    write(
      path.join(ROOT, 'mobile/fastlane/build-context.json'),
      JSON.stringify({ version, versionCode, buildNumber }, null, 2),
    ),
  ]

  console.log(`Version ${version} — build iOS ${buildNumber}, versionCode ${versionCode}`)
  written.forEach((f) => console.log(`  → ${f}`))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
