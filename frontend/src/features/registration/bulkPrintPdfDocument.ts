import { appendConsentPdf } from './consentPdfService';
import { appendTT25PrintPdf } from './tt25HcmPdfService';
import { createPdfPrintSession } from './pdfPrintSession';
import type { TT25RegistrationData } from './tt25Types';

export type BulkPrintMode = 'consent' | 'tt25' | 'both';

export async function generateBulkPrintPdfBytes(
  items: TT25RegistrationData[],
  mode: BulkPrintMode,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const session = await createPdfPrintSession(Infinity);
  for (let i = 0; i < items.length; i++) {
    if (mode !== 'tt25') await appendConsentPdf(items[i], session);
    if (mode !== 'consent') await appendTT25PrintPdf(items[i], session);
    onProgress?.(i + 1, items.length);
  }
  // This runs in a worker; timer-based save batches slow down when the app tab is hidden.
  return session.pdf.save({ objectsPerTick: Infinity });
}
