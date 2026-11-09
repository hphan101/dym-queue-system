import { PDFDocument, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export interface PdfPrintSession {
  pdf: PDFDocument;
  templates: Map<string, Promise<PDFDocument>>;
  fonts: Map<string, Promise<PDFFont>>;
  parseSpeed?: number;
}

export async function createPdfPrintSession(parseSpeed?: number): Promise<PdfPrintSession> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  return { pdf, templates: new Map(), fonts: new Map(), parseSpeed };
}

export async function appendTemplate(session: PdfPrintSession, key: string, bytes: ArrayBuffer) {
  let template = session.templates.get(key);
  if (!template) {
    template = PDFDocument.load(bytes.slice(0), { parseSpeed: session.parseSpeed });
    session.templates.set(key, template);
  }
  const source = await template;
  const pages = await session.pdf.copyPages(source, source.getPageIndices());
  pages.forEach((page) => session.pdf.addPage(page));
  return pages;
}

export function getPrintFont(session: PdfPrintSession, key: string, bytes: ArrayBuffer, subset = true): Promise<PDFFont> {
  const cacheKey = `${key}:${subset}`;
  let font = session.fonts.get(cacheKey);
  if (!font) {
    font = session.pdf.embedFont(bytes.slice(0), { subset });
    session.fonts.set(cacheKey, font);
  }
  return font;
}
