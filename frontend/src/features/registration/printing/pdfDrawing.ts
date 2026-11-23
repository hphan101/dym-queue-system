import { rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export function drawPdfCheck(page: PDFPage, x: number, y: number) {
  const bottom = { x: x - .7, y: y - 2 };
  page.drawLine({ start: { x: x - 2.5, y: y + .1 }, end: bottom, thickness: .8, color: rgb(0, 0, 0) });
  page.drawLine({ start: bottom, end: { x: x + 2.8, y: y + 2.5 }, thickness: .8, color: rgb(0, 0, 0) });
}

export function drawPdfPageNumbers(pages: PDFPage[], font: PDFFont) {
  const size = 10;
  pages.forEach((page, index) => {
    const label = `Trang ${index + 1}/${pages.length}`;
    page.drawText(label, {
      x: page.getWidth() - 36 - font.widthOfTextAtSize(label, size),
      y: 26, size, font, color: rgb(0, 0, 0),
    });
  });
}
