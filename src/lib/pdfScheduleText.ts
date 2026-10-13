import { pdfTextLines, type PdfjsLike } from './pdfLines'

// Client-side PDF text-layer extraction (#260). FFTT's own poule schedule
// export is a real text-layer PDF (see its "Edition du DD/MM/YYYY" footer),
// so this is the common path — ocrScheduleText.ts is the fallback for
// photographed/scanned documents with no usable text layer.

// pdfjs-dist is a large dependency (~1MB+) only ever needed once an admin
// actually opens the import-from-file modal and picks a PDF — a dynamic
// import keeps it out of the app's main bundle entirely.
//
// The `legacy/` build, not the default one, and not for old browsers: pdfjs 6
// calls `Map.prototype.getOrInsertComputed` — a 2025 proposal that Chrome 141
// (the current stable at the time of writing) does not have — and only the
// legacy build ships the polyfills for it. With the default build, rendering a
// page throws "getOrInsertComputed is not a function" outright there, and the
// admin is told "Impossible de lire ce fichier" (#486). Text extraction
// happens to miss those call sites today, which is not a property to rely on:
// whichever engine is one API behind, this path either works or refuses a
// perfectly good calendar.
async function loadPdfjs() {
  const [pdfjsLib, { default: pdfWorkerUrl }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    // Vite-specific asset import: resolves to the worker script's final
    // bundled URL so pdfjs can run parsing off the main thread.
    import('pdfjs-dist/legacy/build/pdf.worker.mjs?url'),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  return pdfjsLib
}

/**
 * Extract text lines from every page of a PDF file, reconstructed from
 * positioned text items (pdfjs's own `getTextContent` join order isn't
 * reliably row-by-row for a multi-column table). Returns an empty array
 * (never throws) when the file has no extractable text layer at all — the
 * caller falls back to OCR in that case. The rebuilding is `pdfLines.ts`,
 * which the API shares to read a PDF for the app (#681).
 */
export async function extractPdfScheduleLines(file: File): Promise<string[]> {
  const pdfjsLib = await loadPdfjs()
  return pdfTextLines(pdfjsLib as unknown as PdfjsLike, await file.arrayBuffer())
}

// Enough resolution for OCR to read the export's smallest type once the page
// is rasterized: A4 at this scale is ~2500px on its long edge, around 150 dpi
// — comfortably past the 1200px floor preprocessForOcr() upscales a phone
// photo to, without making tesseract chew through a needlessly huge bitmap.
const OCR_RENDER_SCALE = 3

/**
 * Render each page of a PDF to a canvas, one at a time, for the OCR fallback.
 *
 * A calendar that was scanned or photographed and then saved as a PDF — an
 * entirely ordinary thing to be handed — has no text layer at all, so
 * extractPdfScheduleLines() above returns nothing. Handing the PDF file
 * itself to the OCR path (which is what happened until #486) only ever threw
 * `InvalidStateError` from createImageBitmap(), which decodes images and not
 * PDFs, and the admin was told "Impossible de lire ce fichier" about a
 * document OCR could read perfectly well. Rasterizing here is what makes it
 * readable — every page, since one file holds every poule of a division.
 *
 * A generator, so only the page being read exists: at this resolution a page
 * is a ~4.5 Mpx bitmap, and a division's export runs to eight of them, which
 * is a straight route to a phone's canvas-memory ceiling.
 */
export async function* renderPdfPages(file: File): AsyncGenerator<HTMLCanvasElement> {
  const pdfjsLib = await loadPdfjs()
  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: buffer })
  try {
    const doc = await loadingTask.promise
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const viewport = page.getViewport({ scale: OCR_RENDER_SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      // No canvasContext: pdfjs takes the canvas itself since v5, and paints a
      // white background under the page — which is what OCR wants anyway.
      await page.render({ canvas, viewport }).promise
      yield canvas
      // Resumed here, the consumer is done with this page — it reads one
      // before asking for the next. Drop the backing store rather than wait
      // for a collection that may not come before the next page is drawn.
      canvas.width = 0
      canvas.height = 0
      page.cleanup()
    }
  } finally {
    await loadingTask.destroy()
  }
}
