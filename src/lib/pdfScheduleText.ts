// Client-side PDF text-layer extraction (#260). FFTT's own poule schedule
// export is a real text-layer PDF (see its "Edition du DD/MM/YYYY" footer),
// so this is the common path — ocrScheduleText.ts is the fallback for
// photographed/scanned documents with no usable text layer.

// pdfjs-dist is a large dependency (~1MB+) only ever needed once an admin
// actually opens the import-from-file modal and picks a PDF — a dynamic
// import keeps it out of the app's main bundle entirely.
async function loadPdfjs() {
  const [pdfjsLib, { default: pdfWorkerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    // Vite-specific asset import: resolves to the worker script's final
    // bundled URL so pdfjs can run parsing off the main thread.
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  return pdfjsLib
}

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

function reconstructLines(items: PositionedItem[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: PositionedItem[][] = []
  for (const item of sorted) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row[0].y - item.y) <= LINE_Y_TOLERANCE) row.push(item)
    else rows.push([item])
  }
  return rows.map((row) => row.sort((a, b) => a.x - b.x).map((i) => i.text).join(' '))
}

/**
 * Extract text lines from every page of a PDF file, reconstructed from
 * positioned text items (pdfjs's own `getTextContent` join order isn't
 * reliably row-by-row for a multi-column table). Returns an empty array
 * (never throws) when the file has no extractable text layer at all — the
 * caller falls back to OCR in that case.
 */
export async function extractPdfScheduleLines(file: File): Promise<string[]> {
  const pdfjsLib = await loadPdfjs()
  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: buffer })
  const lines: string[] = []
  try {
    const doc = await loadingTask.promise
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const content = await page.getTextContent()
      const items: PositionedItem[] = content.items.flatMap((item) => {
        if (!('str' in item) || !item.str.trim()) return []
        return [{ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }]
      })
      lines.push(...reconstructLines(items))
    }
  } finally {
    await loadingTask.destroy()
  }
  return lines
}
