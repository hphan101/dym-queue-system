import type { TT25RegistrationData } from './tt25Types';
import type { BulkPrintMode } from './bulkPrintPdfDocument';

export type { BulkPrintMode } from './bulkPrintPdfDocument';

export interface BulkPrintRequest {
  items: TT25RegistrationData[];
  mode: BulkPrintMode;
}

export type BulkPrintReply =
  | { type: 'progress'; done: number; total: number }
  | { type: 'complete'; buffer: ArrayBuffer }
  | { type: 'error'; message: string };

/**
 * Merge Consent and/or TT25 PDFs of many patients into one file, in the given order.
 * Templates include blank pages so every document starts on a fresh sheet.
 */
export function generateBulkPrintPdf(
  items: TT25RegistrationData[],
  mode: BulkPrintMode,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./bulkPrintPdf.worker.ts', import.meta.url), { type: 'module' });
    const fail = (message: string) => {
      worker.terminate();
      reject(new Error(message));
    };
    worker.onmessage = ({ data }: MessageEvent<BulkPrintReply>) => {
      try {
        if (data.type === 'progress') onProgress?.(data.done, data.total);
        else if (data.type === 'error') fail(data.message);
        else {
          worker.terminate();
          resolve(URL.createObjectURL(new Blob([data.buffer], { type: 'application/pdf' })));
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Không thể tạo file PDF.');
      }
    };
    worker.onerror = () => fail('Không thể tạo file PDF. Vui lòng thử lại.');
    worker.onmessageerror = () => fail('Không thể nhận file PDF. Vui lòng thử lại.');
    try {
      worker.postMessage({ items, mode } satisfies BulkPrintRequest);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Không thể bắt đầu tạo PDF.');
    }
  });
}
