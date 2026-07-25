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

// FFTT's own export renders the "... Poule N" / "1ère phase ..." title as a
// shaded gray banner — a low-contrast band that's a classic OCR failure mode
// even on an otherwise crisp screenshot/photo — and phone photos are often
// lower-resolution than OCR wants. Grayscale + contrast-stretch and a floor
// on resolution before recognition measurably help both cases; this is
// deliberately simple (no perspective correction, no deskew) rather than a
// full document-scanner pipeline.
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
    const contrasted = gray < 180 ? Math.max(0, gray - 40) : Math.min(255, gray + 40)
    d[i] = d[i + 1] = d[i + 2] = contrasted
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/** Extract text lines from an image file (or a rasterized PDF page) via OCR. */
export async function extractOcrScheduleLines(file: File | Blob): Promise<string[]> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('fra')
  try {
    const canvas = await preprocessForOcr(file)
    const { data } = await worker.recognize(canvas)
    return data.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  } finally {
    await worker.terminate()
  }
}
