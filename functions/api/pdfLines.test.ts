// @vitest-environment node
//
// #681 — the API reads a PDF for the app, which runs no pdf.js. The PDF is
// written here, one Helvetica line per fixture line — a font the file does not
// embed, like the AGR's exports —, and must come back as those very lines.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'
import { AGR_PLAYER_LIST } from '../../src/lib/__fixtures__/agrPlayerList'

/** A one-page PDF holding these lines, top to bottom. */
function pdfOf(lines: string[]): Uint8Array {
  const latin1 = (s: string) => Uint8Array.from([...s].map((ch) => ch.charCodeAt(0) & 0xff))
  const esc = (s: string) => s.replace(/[\\()]/g, (m) => `\\${m}`)
  let y = 800
  const content = lines.map((l) => { const op = `BT /F1 9 Tf 40 ${y} Td (${esc(l)}) Tj ET\n`; y -= 12; return op }).join('')
  const body = latin1(content)
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]
  const parts: Uint8Array[] = [latin1('%PDF-1.4\n')]
  const offsets: number[] = []
  let len = parts[0].length
  objs.forEach((o, i) => {
    offsets.push(len)
    const chunk = o === null
      ? new Uint8Array([...latin1(`${i + 1} 0 obj\n<< /Length ${body.length} >>\nstream\n`), ...body, ...latin1('\nendstream\nendobj\n')])
      : latin1(`${i + 1} 0 obj\n${o}\nendobj\n`)
    parts.push(chunk)
    len += chunk.length
  })
  parts.push(latin1(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
    + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`))
  return new Uint8Array(parts.flatMap((p) => [...p]))
}

async function as(userId: string, role: string) {
  const d1 = migratedD1()
  d1.exec("INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES ('landser', '', 'Landser ASL', 0)")
  addMember(d1.exec, { id: userId, firstName: 'Lou', email: 'lou@example.fr', clubId: 'landser', role })
  const token = `token-${userId}`
  d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
    await sessionKey(token), userId, Date.now() + 3_600_000)
  /** Raw bytes as a PDF; a FormData as the multipart fetch builds it, boundary and all. */
  return (body: BodyInit) =>
    app.fetch(new Request('http://localhost/api/pdf/lines', {
      method: 'POST',
      headers: body instanceof FormData
        ? { Authorization: `Bearer ${token}` }
        : { 'Content-Type': 'application/pdf', Authorization: `Bearer ${token}` },
      body,
    }), { DB: d1.db })
}

describe('POST /pdf/lines (#681)', () => {
  it('reads an AGR list back into the lines the browser would have read', async () => {
    const post = await as('admin', 'club_admin')
    const res = await post(pdfOf(AGR_PLAYER_LIST))
    expect(res.status).toBe(200)
    const { lines } = await res.json() as { lines: string[] }
    // The very lines the AGR parser is tested on (agrPlayerList.spec.ts).
    expect(lines).toEqual(AGR_PLAYER_LIST)
  })

  it('takes the multipart upload the app sends', async () => {
    const post = await as('admin', 'club_admin')
    const form = new FormData()
    form.append('file', new File([pdfOf(AGR_PLAYER_LIST)], 'liste.pdf', { type: 'application/pdf' }))
    const res = await post(form)
    expect(res.status).toBe(200)
    expect((await res.json() as { lines: string[] }).lines).toEqual(AGR_PLAYER_LIST)
    // A multipart without its file is refused, not read as bytes.
    expect((await post(new FormData())).status).toBe(400)
  })

  it('refuses a player, and what is not a PDF', async () => {
    expect((await (await as('player', 'player'))(pdfOf(['x']))).status).toBe(403)
    const post = await as('admin', 'club_admin')
    expect((await post(new TextEncoder().encode('bonjour'))).status).toBe(400)
  })
})
