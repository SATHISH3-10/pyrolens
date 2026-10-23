import { parseFirmsCsv } from '../data/firmsCsvImporter'

/**
 * Web Worker for asynchronous background CSV ingestion.
 * Keeps the main UI thread at 60fps even when parsing tens of thousands of satellite records.
 */
self.onmessage = (event: MessageEvent<{ csvText: string; fileName: string; maxRecords?: number }>) => {
  const { csvText, fileName, maxRecords } = event.data
  try {
    const result = parseFirmsCsv(csvText, fileName, maxRecords)
    self.postMessage({ success: true, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    self.postMessage({
      success: false,
      error: `Worker error during CSV processing: ${msg}`,
    })
  }
}
