import { PDFDocument } from 'pdf-lib';

export async function createPdfPagePreview(document: PDFDocument, pageIndex: number): Promise<Blob> {
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= document.getPageCount()) {
    throw new Error('Trang PDF không hợp lệ.');
  }
  const preview = await PDFDocument.create();
  const [page] = await preview.copyPages(document, [pageIndex]);
  preview.addPage(page);
  return new Blob([new Uint8Array(await preview.save())], { type: 'application/pdf' });
}
