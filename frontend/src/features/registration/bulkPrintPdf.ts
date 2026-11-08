import { appendConsentPdf } from './consentPdfService';
import { appendTT25OriginalPdf } from './tt25HcmPdfService';
import { createPdfPrintSession } from './pdfPrintSession';
import type { TT25RegistrationData } from './tt25Types';

export type BulkPrintMode = 'consent' | 'tt25' | 'both';

/**
 * Merge Consent and/or TT25 PDFs of many patients into one file, in the given order.
 * With padForDuplex, each document is padded to an even page count so the next one
 * always starts on a fresh sheet regardless of the selected template's page count.
 */
export async function generateBulkPrintPdf(
  items: TT25RegistrationData[],
  mode: BulkPrintMode,
  padForDuplex: boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const session = await createPdfPrintSession();
  const out = session.pdf;

  for (let i = 0; i < items.length; i++) {
    for (const append of [
      ...(mode !== 'tt25' ? [appendConsentPdf] : []),
      ...(mode !== 'consent' ? [appendTT25OriginalPdf] : []),
    ]) {
      const start = out.getPageCount();
      await append(items[i], session);
      const count = out.getPageCount() - start;
      if (padForDuplex && count % 2 === 1) {
        const { width, height } = out.getPage(out.getPageCount() - 1).getSize();
        out.addPage([width, height]);
      }
    }
    onProgress?.(i + 1, items.length);
    // Let the browser paint progress and remain responsive during large print runs.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  const bytes = await out.save();
  return URL.createObjectURL(
    new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
  );
}
