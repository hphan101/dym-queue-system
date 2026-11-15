import { rgb, type PDFPage } from 'pdf-lib';

export function drawPdfCheck(page: PDFPage, x: number, y: number) {
  const bottom = { x: x - .7, y: y - 2 };
  page.drawLine({ start: { x: x - 2.5, y: y + .1 }, end: bottom, thickness: .8, color: rgb(0, 0, 0) });
  page.drawLine({ start: bottom, end: { x: x + 2.8, y: y + 2.5 }, thickness: .8, color: rgb(0, 0, 0) });
}
