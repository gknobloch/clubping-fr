// The minified pdf.js builds the API loads to read a PDF for the app (#681).
// They ship no types of their own; `pdfLines.ts` states the slice it uses.
declare module 'pdfjs-dist/legacy/build/pdf.min.mjs'
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'
