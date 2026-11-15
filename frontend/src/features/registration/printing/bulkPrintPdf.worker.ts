import { generateBulkPrintPdfBytes } from './bulkPrintPdfDocument';
import type { BulkPrintRequest } from './bulkPrintPdf';

self.onmessage = async ({ data }: MessageEvent<BulkPrintRequest>) => {
  try {
    const bytes = await generateBulkPrintPdfBytes(data.items, data.mode, (done, total) => {
      self.postMessage({ type: 'progress', done, total });
    });
    const buffer = bytes.slice().buffer;
    self.postMessage({ type: 'complete', buffer }, { transfer: [buffer] });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Không thể tạo file PDF.' });
  }
};
