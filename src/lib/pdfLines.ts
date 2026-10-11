// A PDF's text lines, rebuilt from positioned text items (#260, #681).
//
// Shared by the browser (pdfScheduleText.ts) and the API, which reads a PDF
// for the mobile app: Hermes runs no pdf.js — it has no ReadableStream — so a
// phone sends the file and gets these lines back (#681). No DOM here, and no
// pdf.js import either: each side loads its own build and hands it in.

/** Row of positioned text items, later grouped into lines by y-position. */
interface PositionedItem {
  text: string
  x: number
  y: number
}

// Items whose baselines fall within this many PDF units of each other are
// treated as the same table row — FFTT's export uses a regular row height
// well above this, so it only merges genuinely same-row fragments.
const LINE_Y_TOLERANCE = 2

export function reconstructLines(items: PositionedItem[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: PositionedItem[][] = []
  for (const item of sorted) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row[0].y - item.y) <= LINE_Y_TOLERANCE) row.push(item)
    else rows.push([item])
  }
  return rows.map((row) => row.sort((a, b) => a.x - b.x).map((i) => i.text).join(' '))
}

/** One chunk of pdfjs's text stream: text items, plus marked-content markers with no `str`. */
interface TextContentChunk {
  items: Array<{ str?: string; transform?: number[] }>
}

/**
 * Read one page's positioned text items.
 *
 * Deliberately NOT `page.getTextContent()`, which is the same stream read for
 * us: pdfjs consumes it with `for await (… of readableStream)`, and WebKit
 * still does not implement async iteration over a ReadableStream
 * (https://bugs.webkit.org/show_bug.cgi?id=194379). On an iPhone that call
 * throws "undefined is not a function" before returning a single line, so
 * every text-layer PDF — the common case, FFTT's own export included — was
 * refused there with nothing but "Impossible de lire ce fichier" (#486).
 * A reader does the same work, minus the styles and language nothing here
 * reads. Keep it that way: no `for await` over a stream, on any path an
 * import depends on.
 */
async function readTextItems(page: { streamTextContent: () => ReadableStream }): Promise<PositionedItem[]> {
  const reader = (page.streamTextContent() as ReadableStream<TextContentChunk>).getReader()
  const items: PositionedItem[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    for (const item of value.items) {
      const text = item.str?.trim()
      if (!text || !item.transform) continue
      items.push({ text, x: item.transform[4], y: item.transform[5] })
    }
  }
  return items
}

/** The slice of pdf.js this needs — either build, browser or worker. */
export interface PdfjsLike {
  getDocument: (src: { data: ArrayBuffer | Uint8Array; isEvalSupported?: boolean; useWorkerFetch?: boolean }) => {
    promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ streamTextContent: () => ReadableStream }> }>
    destroy: () => Promise<void>
  }
}

/**
 * Every page's text lines, in reading order. Empty (never a throw) when the
 * PDF has no text layer — a scan — which the caller says or works around.
 */
export async function pdfTextLines(pdfjs: PdfjsLike, data: ArrayBuffer | Uint8Array): Promise<string[]> {
  // No `eval` — a Worker refuses it, and reading text never needs it.
  const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false, useWorkerFetch: false })
  const lines: string[] = []
  try {
    const doc = await loadingTask.promise
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      lines.push(...reconstructLines(await readTextItems(page)))
    }
  } finally {
    await loadingTask.destroy()
  }
  return lines
}
