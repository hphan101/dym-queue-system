import { PDFDocument } from 'pdf-lib';
import { generateConsentPdf } from './consentPdfService';
import { generateTT25OriginalPdf } from './tt25HcmPdfService';
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
  const out = await PDFDocument.create();

  for (let i = 0; i < items.length; i++) {
    const parts = [];
    if (mode !== 'tt25') parts.push(await generateConsentPdf(items[i]));
    if (mode !== 'consent') parts.push(await generateTT25OriginalPdf(items[i]));

    for (const { blob, url } of parts) {
      URL.revokeObjectURL(url);
      const src = await PDFDocument.load(await blob.arrayBuffer());
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((page) => out.addPage(page));
      if (padForDuplex && pages.length % 2 === 1) {
        const { width, height } = pages[pages.length - 1].getSize();
        out.addPage([width, height]);
      }
    }
    onProgress?.(i + 1, items.length);
  }

  const bytes = await out.save();
  return URL.createObjectURL(
    new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
  );
}
