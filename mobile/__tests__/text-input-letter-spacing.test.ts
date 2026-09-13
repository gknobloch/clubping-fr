import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Placeholders, and the letter-spacing iOS invents (#118, found again in #520)
//
// iOS renders a TextInput placeholder with stray letter-spacing unless the
// style pins an explicit value — "R e c h e r c h e r   u n   j o u e u r"
// instead of "Rechercher un joueur". It only shows on a device or simulator,
// only in the placeholder, and never in a snapshot or a render test: the
// string is correct, the glyphs are laid out wrong.
//
// login.tsx carried the fix and a note explaining it since #118. Two later
// search fields did not, and it took a store screenshot to notice. Nothing
// about rendering can catch this, so it is checked in the source: every style
// a TextInput uses must say what its letter-spacing is.
// ---------------------------------------------------------------------------

const MOBILE = path.join(__dirname, '..')
const SKIP = new Set(['node_modules', 'ios', 'android', '.expo', '.maestro'])

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

/** The style names a file hands to a TextInput: `style={s.search}` → "search". */
function textInputStyleNames(source: string): string[] {
  const names: string[] = []
  const inputs = source.split('<TextInput').slice(1)
  for (const input of inputs) {
    // Only look inside this element's own props, not the rest of the file.
    const props = input.slice(0, input.indexOf('/>') + 1 || input.length)
    for (const m of props.matchAll(/style=\{\[?\s*\w+\.(\w+)/g)) names.push(m[1])
  }
  return names
}

/** Whether `styles.<name> = { … }` pins letterSpacing. */
function stylePinsLetterSpacing(source: string, name: string): boolean {
  const start = source.indexOf(`  ${name}: {`)
  if (start === -1) return false
  const end = source.indexOf('\n  },', start)
  return source.slice(start, end === -1 ? undefined : end).includes('letterSpacing:')
}

const files = sourceFiles(MOBILE).filter((f) => readFileSync(f, 'utf8').includes('<TextInput'))

describe('every TextInput says what its letter-spacing is', () => {
  it('finds the files that have one at all', () => {
    // A guard that silently matches nothing is worse than no guard.
    expect(files.length).toBeGreaterThan(3)
  })

  // The offenders are listed rather than asserted one at a time: a failure
  // should name every style that needs the fix, not just the first.
  it.each(files.map((f) => [path.relative(MOBILE, f), f]))('%s', (_label, file) => {
    const source = readFileSync(file, 'utf8')
    const unpinned = textInputStyleNames(source).filter(
      (name) => !stylePinsLetterSpacing(source, name),
    )
    expect(unpinned).toEqual([])
  })
})
