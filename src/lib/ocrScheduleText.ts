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

/** Extract text lines from an image file (or a rasterized PDF page) via OCR. */
export async function extractOcrScheduleLines(file: File | Blob): Promise<string[]> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('fra')
  try {
    const { data } = await worker.recognize(file)
    return data.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  } finally {
    await worker.terminate()
  }
}
