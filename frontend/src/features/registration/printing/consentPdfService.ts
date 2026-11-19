import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import { appendTemplate, createPdfPrintSession, getPrintFont, type PdfPrintSession } from './pdfPrintSession';
import { formatDateForPrint, getTodayInVietnam } from '../../../lib/date';
import { drawPdfCheck } from './pdfDrawing';
import layouts from './consentTemplateFields.json';
import { CONSENT_FORM_VERSION, type TT25RegistrationData } from '../tt25Types';

export type ConsentFormLanguage = 'vi' | 'bilingual';
export type ConsentPageOption = 'all' | 'consent' | 'refusal';

const assets = new Map<string, Promise<ArrayBuffer>>();
const ASSET_VERSION = '20261119-consent-v5';

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
    gender: data.gender === 'Nam' || data.gender === 'Nữ'
      ? language === 'bilingual' ? (data.gender === 'Nam' ? 'Nam / Male' : 'Nữ / Female') : data.gender
      : '',
    phoneNumber: (data.phoneNumber || '').trim(), email: (data.email || '').trim(),
    workplace: (data.workplace || '').trim(), checkupDate, checkupDay, checkupMonth, checkupYear,
  };
  const queueNumber = (data.queueNumber || '').trim();
  if (queueNumber) {
    const numberSize = Math.min(24, 130 / fonts.bold.widthOfTextAtSize(queueNumber, 1));
    const x = 517.5 - fonts.bold.widthOfTextAtSize(queueNumber, numberSize) / 2;
    for (const index of [layout.consentPages[0], layout.refusalPages[0]]) {
      pages[index].drawText(queueNumber, {
        x, y: pages[index].getHeight() - 73, size: numberSize, font: fonts.bold, color: rgb(0, 0, 0),
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
  const mark = (point: { page: number; x: number; y: number }) => drawPdfCheck(pages[point.page], point.x, point.y);
  if (data.gender === 'Nam' || data.gender === 'Nữ') mark(layout.genderMarks[data.gender]);
  if (data.gender === 'Nữ' && data.pregnancyStatus && Object.hasOwn(layout.pregnancyMarks, data.pregnancyStatus)) {
    mark(layout.pregnancyMarks[data.pregnancyStatus]);
  }
  if (typeof data.advertisingConsentAgreed === 'boolean') {
    if (typeof data.consentAgreed === 'boolean') {
      mark(layout.consentMarks.examination[data.consentAgreed ? 'agree' : 'decline']);
    }
    if (data.consentFormVersion === CONSENT_FORM_VERSION) {
      mark(layout.consentMarks.advertising[data.advertisingConsentAgreed ? 'agree' : 'decline']);
    }
  }
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
