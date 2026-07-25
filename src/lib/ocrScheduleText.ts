// Client-side OCR fallback (#260) for schedule documents with no usable PDF
// text layer — typically a photographed or scanned poule sheet. Runs fully
// in-browser via tesseract.js (WASM), no server secret. This is the weakest
// link in the whole no-LLM import: table columns can misalign and purely
// numeric tokens (the club affiliation number has no error-correcting
// structure) are the most failure-prone — see ffttScheduleDocument.ts's
// AFFILIATION_NUMBER_RE validation, which flags rather than trusts them.

// Dynamic import: tesseract.js is only needed once an admin actually opens
// the import-from-file modal and a document needs OCR — this keeps it (and
// its WASM core) out of the app's main bundle entirely.

// FFTT's own export renders the "... Poule N" / "1ère phase ..." title inside
// a shaded, bordered box near the top of the page — a low-contrast band
// that's a classic OCR failure mode even on an otherwise crisp
// screenshot/photo — and phone photos are often lower-resolution than OCR
// wants. Grayscale + contrast-stretch and a floor on resolution before
// recognition measurably help both cases; this is deliberately simple (no
// perspective correction, no deskew) rather than a full document-scanner
// pipeline.
//
// The stretch is centered on the middle gray (128), not a fixed cutoff: two
// grays that are already on the same side of a fixed cutoff (plausible for
// dark text on a not-too-different gray banner background) would get pushed
// by the same fixed amount and stay just as hard to tell apart — a stretch
// around the midpoint always increases the gap between two different grays,
// whichever side of the midpoint they start on.
const CONTRAST_FACTOR = 1.6

async function preprocessForOcr(file: File | Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file)
  const scale = bitmap.width < 1200 ? 1200 / bitmap.width : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const contrasted = Math.min(255, Math.max(0, (gray - 128) * CONTRAST_FACTOR + 128))
    d[i] = d[i + 1] = d[i + 2] = contrasted
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/** Extract text lines from an image file (or a rasterized PDF page) via OCR. */
export async function extractOcrScheduleLines(file: File | Blob): Promise<string[]> {
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker('fra')
  try {
    const canvas = await preprocessForOcr(file)
    const { data } = await worker.recognize(canvas)
    const lines = data.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.some((l) => /Poule/i.test(l))) return lines

    // Tesseract's automatic layout analysis (the default PSM.AUTO) can
    // classify a bordered, shaded box as a non-text graphic and drop it
    // entirely rather than misreading it — confirmed against a real upload
    // whose extracted text started exactly at the roster table, with the
    // title box simply absent, not garbled. Re-OCR the whole page with a
    // page-segmentation mode that makes no layout assumptions, which is far
    // less likely to discard it. This deliberately re-scans the full page
    // rather than just a guessed-at top slice: a phone photo can have the
    // title positioned anywhere depending on how much blank margin got
    // captured around the paper, so guessing a fixed region is exactly the
    // kind of layout assumption this pass exists to avoid. Prepend whatever
    // it finds rather than trusting it over the already-good body read
    // above — any fragment it duplicates from the body falls before the
    // header line once located, so it's never read as roster/journée data.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    const retry = await worker.recognize(canvas)
    const retryLines = retry.data.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    return [...retryLines, ...lines]
  } finally {
    await worker.terminate()
  }
}
