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

const JAPANESE_TEXT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
let japaneseFontBytes: Promise<ArrayBuffer> | undefined;

export async function getPrintFontForText(session: PdfPrintSession, text: string, defaultFont: PDFFont): Promise<PDFFont> {
  if (!JAPANESE_TEXT.test(text)) return defaultFont;

  japaneseFontBytes ??= fetch('/fonts/NotoSansJP-Regular.ttf').then(async (response) => {
    if (!response.ok) throw new Error('Không thể tải phông chữ tiếng Nhật.');
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) throw new Error('File phông chữ tiếng Nhật không có dữ liệu.');
    return bytes;
  }).catch((error) => { japaneseFontBytes = undefined; throw error; });

  return getPrintFont(session, 'noto-sans-jp', await japaneseFontBytes);
}
