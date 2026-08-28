/**
 * Ambient declaration for the optional `tesseract.js` package.
 *
 * tesseract.js is NOT part of the default install (it pulls a large WASM engine).
 * When a user wants real local OCR they install it (`npm i tesseract.js`) and set
 * OCR_MODE=tesseract. Without it, the TesseractOcrService simply returns empty
 * results; the runtime dynamic import can fail and is caught by the pipeline.
 */
declare module 'tesseract.js';