import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import { appendTemplate, createPdfPrintSession, getPrintFont, type PdfPrintSession } from './pdfPrintSession';
import { formatDateForPrint, getTodayInVietnam } from '../../lib/date';
import { drawPdfCheck } from './pdfDrawing';
import layouts from './consentTemplateFields.json';
import type { TT25RegistrationData } from './tt25Types';

export type ConsentFormLanguage = 'vi' | 'bilingual';
export type ConsentPageOption = 'all' | 'consent' | 'refusal';

const assets = new Map<string, Promise<ArrayBuffer>>();
const ASSET_VERSION = '20261110-original-consent-pages';

function loadAsset(path: string): Promise<ArrayBuffer> {
  let pending = assets.get(path);
  if (!pending) {
    pending = fetch(`${path}?v=${ASSET_VERSION}`).then(async (response) => {
      if (!response.ok) throw new Error('Không thể tải mẫu đồng thuận gốc hoặc phông chữ.');
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength) throw new Error('File mẫu đồng thuận không có dữ liệu.');
      return bytes;
    }).catch((error) => { assets.delete(path); throw error; });
    assets.set(path, pending);
  }
  return pending;
}

export function getConsentFormLanguage(data: Pick<TT25RegistrationData, 'language'>): ConsentFormLanguage {
  return data.language === 'en' ? 'bilingual' : 'vi';
}

export function getConsentPageIndices(language: ConsentFormLanguage, option: ConsentPageOption): number[] {
  const layout = layouts[language];
  return option === 'consent' ? layout.consentPages : option === 'refusal' ? layout.refusalPages
    : Array.from({ length: layout.pageCount }, (_, index) => index);
}

export async function appendConsentPdf(data: TT25RegistrationData, session: PdfPrintSession): Promise<void> {
  const language = getConsentFormLanguage(data);
  const layout = layouts[language];
  const [template, regular, bold, italic, boldItalic] = await Promise.all([
    loadAsset(`/templates/${layout.template}`), loadAsset('/fonts/arial.ttf'),
    loadAsset('/fonts/arialbd.ttf'), loadAsset('/fonts/ariali.ttf'), loadAsset('/fonts/arialbi.ttf'),
  ]);
  const pages = await appendTemplate(session, layout.template, template);
  if (pages.length !== layout.pageCount) throw new Error('Số trang mẫu đồng thuận không đúng với mẫu gốc.');
  const fontBytes = { regular, bold, italic, boldItalic };
  const fonts: Record<string, PDFFont> = {};
  await Promise.all(Object.entries(fontBytes).map(async ([name, bytes]) => {
    fonts[name] = await getPrintFont(session, `arial:${name}`, bytes);
  }));
  const checkupDate = formatDateForPrint(data.checkupDate || getTodayInVietnam());
  const [checkupDay = '', checkupMonth = '', checkupYear = ''] = checkupDate.split('/');
  const values: Record<string, string> = {
    fullName: (data.fullName || '').trim().toUpperCase(),
    birthDate: formatDateForPrint(data.birthDate), identityDocument: (data.cccd || '').trim(),
    phoneNumber: (data.phoneNumber || '').trim(), email: (data.email || '').trim(),
    workplace: (data.workplace || '').trim(), checkupDate, checkupDay, checkupMonth, checkupYear,
  };
  const queueNumber = (data.queueNumber || '').trim();
  if (queueNumber) {
    const label = 'Số thứ tự';
    const english = language === 'bilingual' ? ' / Order' : '';
    const labelSize = 11;
    const labelWidth = fonts.bold.widthOfTextAtSize(label, labelSize);
    const englishWidth = fonts.boldItalic.widthOfTextAtSize(english, labelSize);
    const centerX = 478;
    const labelX = centerX - (labelWidth + englishWidth) / 2;
    const numberSize = Math.min(28, 140 / fonts.bold.widthOfTextAtSize(queueNumber, 1));
    for (const index of [layout.consentPages[0], layout.refusalPages[0]]) {
      pages[index].drawText(label, { x: labelX, y: 802, size: labelSize, font: fonts.bold, color: rgb(.4, .4, .4) });
      if (english) pages[index].drawText(english, { x: labelX + labelWidth, y: 802, size: labelSize, font: fonts.boldItalic, color: rgb(.35, .48, .6) });
      pages[index].drawText(queueNumber, {
        x: centerX - fonts.bold.widthOfTextAtSize(queueNumber, numberSize) / 2,
        y: 770, size: numberSize, font: fonts.bold, color: rgb(0, 0, 0),
      });
    }
  }
  for (const field of layout.fields) {
    const value = values[field.field];
    if (!value) continue;
    const font = fonts[field.font];
    const size = Math.min(field.size, field.width / font.widthOfTextAtSize(value, 1));
    const width = font.widthOfTextAtSize(value, size);
    pages[field.page].drawText(value, {
      x: field.align === 'center' ? field.x - width / 2 : field.x,
      y: field.y, size, font, color: rgb(0, 0, 0),
    });
  }
  const mark = layout.genderMarks[data.gender];
  if (mark) drawPdfCheck(pages[0], mark.x, mark.y);

}

export async function generateConsentPdf(data: TT25RegistrationData, pageOption: ConsentPageOption = 'all'): Promise<{ blob: Blob; url: string }> {
  const session = await createPdfPrintSession();
  await appendConsentPdf(data, session);
  const pdf = session.pdf;
  const language = getConsentFormLanguage(data);
  let output = pdf;
  if (pageOption !== 'all') {
    output = await PDFDocument.create();
    const selected = await output.copyPages(pdf, getConsentPageIndices(language, pageOption));
    selected.forEach((page) => output.addPage(page));
  }
  const bytes = await output.save();
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  return { blob, url: URL.createObjectURL(blob) };
}
