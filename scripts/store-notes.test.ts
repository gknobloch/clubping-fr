import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
// @ts-expect-error — plain ESM script, no type declarations by design
import {
  parseChangelog,
  renderBlocks,
  notesForSection,
  checkLimits,
  sectionForVersion,
  PLAY_LIMIT,
  APP_STORE_LIMIT,
} from './store-notes.mjs'

// ---------------------------------------------------------------------------
// Store release notes (#492)
//
// The three store fields are written once and cannot be corrected after a
// release without another submission, so what matters here is not that the
// script produces text — it is that the text is the CHANGELOG's, unwrapped, and
// that anything a store would reject stops the release instead of shipping cut
// in half.
// ---------------------------------------------------------------------------

const CHANGELOG = path.join(__dirname, '../mobile/CHANGELOG.md')

const section = (body: string) => parseChangelog(body)[0]

describe('parseChangelog', () => {
  it('reads a version and its date off the heading', () => {
    const [s] = parseChangelog('## 1.3.0 — 9 septembre 2026\n\nUne ligne.\n')
    expect(s.version).toBe('1.3.0')
  })

  // The file spends most of its life with an unnumbered section at the top.
  // Treating that as a parse error would make the script unusable between
  // releases, which is exactly when the CHANGELOG is being written.
  it('keeps « À paraître » as a section with no version', () => {
    const [s] = parseChangelog('## À paraître\n\n- Quelque chose.\n')
    expect(s.version).toBeNull()
    expect(s.blocks).toHaveLength(1)
  })

  it('ignores the file preamble above the first section', () => {
    const sections = parseChangelog('# Notes de version\n\nDu texte.\n\n## 1.0.0 — hier\n\nUn.\n')
    expect(sections).toHaveLength(1)
    expect(sections[0].version).toBe('1.0.0')
  })

  it('joins the hard-wrapped continuation lines of one bullet', () => {
    const s = section('## 1.0.0 — hier\n\n- Une phrase coupée\n  sur deux lignes.\n')
    expect(s.blocks).toHaveLength(1)
    expect(renderBlocks(s.blocks)).toBe('• Une phrase coupée sur deux lignes.')
  })

  it('keeps a paragraph that follows the bullets', () => {
    const s = section('## 1.0.0 — hier\n\nEn-tête.\n\n- Un.\n- Deux.\n\nEt une conclusion.\n')
    expect(s.blocks.map((b: { type: string }) => b.type)).toEqual([
      'paragraph',
      'bullet',
      'bullet',
      'paragraph',
    ])
  })
})

describe('renderBlocks', () => {
  it('strips the markdown a store field would show literally', () => {
    const s = section('## 1.0.0 — hier\n\n- Un tag **Sans licence** et du `code`.\n')
    expect(renderBlocks(s.blocks)).toBe('• Un tag Sans licence et du code.')
  })

  it('runs bullets together and gives a paragraph its own air', () => {
    const s = section('## 1.0.0 — hier\n\nEn-tête.\n\n- Un.\n- Deux.\n')
    expect(renderBlocks(s.blocks)).toBe('En-tête.\n\n• Un.\n• Deux.')
  })
})

describe('notesForSection', () => {
  it('gives all three fields the same text when the version has no Play short form', () => {
    const notes = notesForSection(section('## 1.0.0 — hier\n\n- Un.\n'))
    expect(notes.appStore).toBe('• Un.')
    expect(notes.play).toBe('• Un.')
    expect(notes.testflight).toBe('• Un.')
  })

  // Play takes 500 characters against the App Store's 4 000, so a long release
  // carries a second, shorter text. It is written, not cut by the script.
  it('uses the « ### Play » subsection for Play alone', () => {
    const s = section('## 1.0.0 — hier\n\n- Une longue explication.\n\n### Play\n\nLa version courte.\n')
    const notes = notesForSection(s)
    expect(notes.play).toBe('La version courte.')
    expect(notes.appStore).toBe('• Une longue explication.')
  })

  it('does not let the Play subsection leak into the App Store text', () => {
    const s = section('## 1.0.0 — hier\n\n- Un.\n\n### Play\n\nCourt.\n')
    expect(s.blocks).toHaveLength(1)
  })
})

describe('checkLimits', () => {
  it('passes text within both limits', () => {
    expect(checkLimits({ appStore: 'Un.', play: 'Un.' }, '1.0.0')).toEqual([])
  })

  // Truncating would land mid-sentence on a field nobody can correct after
  // release. Failing hands the choice back to whoever wrote the notes.
  it('refuses a Play text over the limit rather than cutting it', () => {
    const long = 'a'.repeat(PLAY_LIMIT + 1)
    const problems = checkLimits({ appStore: long, play: long }, '1.4.0')
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('### Play')
    expect(problems[0]).toContain(String(PLAY_LIMIT + 1))
  })

  it('refuses an App Store text over the limit', () => {
    const long = 'a'.repeat(APP_STORE_LIMIT + 1)
    const problems = checkLimits({ appStore: long, play: 'Court.' }, '1.4.0')
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('App Store')
  })

  it('refuses a version whose section is empty', () => {
    expect(checkLimits({ appStore: '', play: '' }, '1.4.0')[0]).toContain('vide')
  })

  // Counted in code points: a store counts characters, not UTF-16 units.
  it('counts an astral character once', () => {
    expect(checkLimits({ appStore: 'x', play: '🏓'.repeat(PLAY_LIMIT) }, '1.4.0')).toEqual([])
  })
})

describe('sectionForVersion', () => {
  it('names the missing rename step when the version has no section', () => {
    const sections = parseChangelog('## À paraître\n\n- Un.\n')
    expect(() => sectionForVersion(sections, '1.4.0')).toThrow(/À paraître/)
  })
})

// The script's whole purpose is this file; a format change here silently
// changes what the stores show, so it is read as-is rather than mocked.
describe('the real mobile/CHANGELOG.md', () => {
  const sections = parseChangelog(readFileSync(CHANGELOG, 'utf8'))
  const shipped = sections.filter((s: { version: string | null }) => s.version)

  it('parses every shipped version', () => {
    expect(shipped.length).toBeGreaterThan(0)
    expect(shipped.map((s: { version: string }) => s.version)).toContain('1.3.0')
  })

  it('holds an « À paraître » section for the next release', () => {
    expect(sections.some((s: { version: string | null }) => s.version === null)).toBe(true)
  })

  it('keeps every shipped version within the stores’ limits', () => {
    for (const s of shipped) {
      expect({ version: s.version, problems: checkLimits(notesForSection(s), s.version) }).toEqual({
        version: s.version,
        problems: [],
      })
    }
  })
})
