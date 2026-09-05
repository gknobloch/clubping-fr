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
// wants. Binarizing (pure black/white, no gray survives) and a floor on
// resolution before recognition measurably help both cases; this is
// deliberately simple (no perspective correction, no deskew) rather than a
// full document-scanner pipeline.
//
// A soft contrast stretch around the midpoint was tried first and confirmed
// insufficient against a real upload: it still left the shaded box's
// background and text close enough together that OCR came back with
// unreadable fragments instead of nothing. A single global Otsu threshold
// (the standard black/white OCR preprocessing technique) was tried next and
// is still not quite enough on its own: it's computed from the WHOLE image's
// histogram, which the much larger plain-white body dominates, so a shaded
// header band that's a small fraction of total pixels doesn't necessarily
// land on the right side of that one global cutoff even though it clearly
// should locally — confirmed against a synthetic image where the header was
// found but "Poule" itself came back character-garbled ("Poui").
//
// Binarizing each tile of the image against its OWN local Otsu threshold
// fixes that: a tile inside the shaded header adapts to its own
// background/text tones instead of the body's, and a tile of body text
// adapts to its own (typically landing close to the global result anyway,
// since it's already high-contrast).
const TILE_SIZE = 180

function otsuThreshold(histogram: number[], count: number): number {
  if (count === 0) return 128
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * histogram[t]
  let sumB = 0, weightB = 0, bestVariance = 0, threshold = 128
  for (let t = 0; t < 256; t++) {
    weightB += histogram[t]
    if (weightB === 0) continue
    const weightF = count - weightB
    if (weightF === 0) break
    sumB += t * histogram[t]
    const meanB = sumB / weightB
    const meanF = (sum - sumB) / weightF
    const variance = weightB * weightF * (meanB - meanF) * (meanB - meanF)
    if (variance > bestVariance) { bestVariance = variance; threshold = t }
  }
  return threshold
}

function adaptiveBinarize(gray: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length)
  for (let tileY = 0; tileY < height; tileY += TILE_SIZE) {
    const tileH = Math.min(TILE_SIZE, height - tileY)
    for (let tileX = 0; tileX < width; tileX += TILE_SIZE) {
      const tileW = Math.min(TILE_SIZE, width - tileX)
      const histogram = new Array(256).fill(0)
      for (let y = 0; y < tileH; y++) {
        const rowStart = (tileY + y) * width + tileX
        for (let x = 0; x < tileW; x++) histogram[gray[rowStart + x]]++
      }
      const threshold = otsuThreshold(histogram, tileW * tileH)
      for (let y = 0; y < tileH; y++) {
        const rowStart = (tileY + y) * width + tileX
        for (let x = 0; x < tileW; x++) {
          out[rowStart + x] = gray[rowStart + x] < threshold ? 0 : 255
        }
      }
    }
  }
  return out
}

/**
 * One page to read: an image (a picked File is one), or a canvas a PDF page
 * was rendered onto (renderPdfPages, in pdfScheduleText.ts). A PDF is never a
 * page itself — createImageBitmap() below decodes images, not documents, and
 * given one it throws (#486).
 */
export type OcrPage = Blob | HTMLCanvasElement

/** One page, or however many a document turned out to have. */
export type OcrPages = OcrPage | Iterable<OcrPage> | AsyncIterable<OcrPage>

async function preprocessForOcr(page: OcrPage): Promise<HTMLCanvasElement> {
  const source = page instanceof HTMLCanvasElement ? page : await createImageBitmap(page)
  const scale = source.width < 1200 ? 1200 / source.width : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imageData.data
  const gray = new Uint8ClampedArray(d.length / 4)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  }
  const bw = adaptiveBinarize(gray, canvas.width, canvas.height)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    d[i] = d[i + 1] = d[i + 2] = bw[j]
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

// A line plausibly belonging to the title block: "... Poule N" or "1ère
// phase YYYY-YYYY". Deliberately loose (just the keyword) — this is used to
// pick out the one or two lines worth trusting from the noisy retry pass
// below, not to validate them; ffttScheduleDocument.ts's own regexes do the
// real validation once these lines are handed to the parser.
const TITLE_LINE_RE = /Poule|phase/i

/**
 * Extract text lines from one or more pages — an image file, or the canvases a
 * PDF's pages were rendered onto — via OCR, in order. One worker reads them
 * all: creating it downloads the French language data, which is by far the
 * most expensive part of a run and has nothing to do with the page.
 */
export async function extractOcrScheduleLines(pages: OcrPages): Promise<string[]> {
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker('fra')
  try {
    const lines: string[] = []
    // `for await` over the one-page case too, and over the PDF renderer's
    // generator, which only draws the next page once this one has been read.
    for await (const page of isMany(pages) ? pages : [pages]) {
      lines.push(...await recognizePage(worker, page, PSM))
    }
    return lines
  } finally {
    await worker.terminate()
  }
}

function isMany(pages: OcrPages): pages is Iterable<OcrPage> | AsyncIterable<OcrPage> {
  return Symbol.iterator in pages || Symbol.asyncIterator in pages
}

type Tesseract = typeof import('tesseract.js')
type OcrWorker = Awaited<ReturnType<Tesseract['createWorker']>>

/** Read one page, with the title-box rescue pass below when it needs it. */
async function recognizePage(worker: OcrWorker, page: OcrPage, PSM: Tesseract['PSM']): Promise<string[]> {
  const canvas = await preprocessForOcr(page)
  const { data } = await worker.recognize(canvas)
  const lines = data.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.some((l) => /Poule/i.test(l))) return lines

  // Tesseract's default automatic layout analysis (PSM.AUTO) can classify
  // a bordered, shaded box as a non-text graphic and drop it entirely
  // rather than misreading it — confirmed against a real upload whose
  // extracted text started exactly at the roster table, the title box
  // simply absent, not garbled, even after the per-tile binarization above
  // (which fixes the header's own readability once Tesseract actually
  // attempts to read it, but not this layout-classification problem).
  // PSM.SPARSE_TEXT ("find text in no particular order") re-attempts the
  // whole page without that layout analysis, which does recover the box —
  // but only pull the specific title-shaped line(s) out of its result
  // rather than trusting the rest of it: sparse mode's lack of layout
  // assumptions produces heavy noise on anything with real-world grain
  // (compression artifacts, camera noise), and that noise routinely lands
  // on the same output line as otherwise-correct body text, breaking the
  // parser's end-of-line-anchored regexes — confirmed against a noisy
  // synthetic image where trusting the full retry output corrupted an
  // otherwise perfectly-read roster/journée section.
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
  const retry = await worker.recognize(canvas)
  const retryLines = retry.data.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const recovered = retryLines.filter((l) => TITLE_LINE_RE.test(l))
  // Back to the default for the next page: sparse mode is a rescue for this
  // page's title box, not a setting the rest of the document should inherit.
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
  return [...recovered, ...lines]
}
