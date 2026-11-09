import { rgb, type PDFFont } from 'pdf-lib';
import { appendTemplate, createPdfPrintSession, getPrintFont, type PdfPrintSession } from './pdfPrintSession';
import { formatDateForPrint, getTodayInVietnam } from '../../lib/date';
import { drawPdfCheck } from './pdfDrawing';
import { getDefaultTargetPaymentByReason, getTT25PrintCopies, type TT25RegistrationData, type TT25TargetPaymentInfo } from './tt25Types';
import layouts from './tt25TemplateFields.json';

export { getTT25PrintCopies } from './tt25Types';

export function getTT25TemplateInfo(data: TT25RegistrationData): { key: keyof typeof layouts | 'legacy'; label: string; pageCount: number } {
  if (data.branch === 'hn') return { key: 'legacy', label: 'Hà Nội', pageCount: 7 };
  if (/work\s*permit|\bwp\b/i.test(data.checkupReason || '')) {
    return { key: 'wp', label: 'Work Permit', pageCount: layouts.wp.pageCount };
  }
  if (data.language === 'en') {
    return { key: 'bilingual', label: 'Song ngữ Việt - Anh', pageCount: layouts.bilingual.pageCount };
  }
  return { key: 'vnm', label: 'Tiếng Việt', pageCount: layouts.vnm.pageCount };
}

function formatPaymentSource(payment: TT25TargetPaymentInfo, bilingual: boolean): string {
  if (payment.paymentSource === 'employer') {
    return bilingual ? 'Người sử dụng lao động / Employer' : 'Người sử dụng lao động chi trả';
  }
  if (payment.paymentSource === 'self') {
    return bilingual ? 'Tự chi trả / Self-paid' : 'Người dân tự chi trả';
  }
  return payment.paymentOtherDetails || (bilingual ? 'Khác / Other' : 'Nguồn khác');
}

const assets = new Map<string, Promise<ArrayBuffer>>();
function loadAsset(path: string) {
  let request = assets.get(path);
  if (!request) {
    request = fetch(`${path}?v=20261103-tt25-continuous-document-number`).then(async (response) => {
      if (!response.ok) throw new Error('Không tải được mẫu TT25 gốc hoặc phông chữ.');
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength) throw new Error('File mẫu TT25 không có dữ liệu.');
      return bytes;
    }).catch((error) => { assets.delete(path); throw error; });
    assets.set(path, request);
  }
  return request;
}

export async function appendTT25OriginalPdf(data: TT25RegistrationData, session: PdfPrintSession): Promise<void> {
  const info = getTT25TemplateInfo(data);
  if (info.key === 'legacy') {
    const legacy = await import('./tt25PdfService');
    await legacy.appendTT25OriginalPdf(data, session);
    return;
  }
  const layout = layouts[info.key];
  const fontNames = ['regular', 'bold', 'italic', 'boldItalic'] as const;
  const bytes = await Promise.all([loadAsset(`/templates/${layout.template}`),
    ...['arial.ttf', 'arialbd.ttf', 'ariali.ttf', 'arialbi.ttf'].map((file) => loadAsset(`/fonts/${file}`))]);
  const pages = await appendTemplate(session, layout.template, bytes[0]);
  if (pages.length !== layout.pageCount) throw new Error('Số trang mẫu TT25 không khớp bản gốc.');
  const fonts: Record<string, PDFFont> = {};
  await Promise.all(fontNames.map(async (name, index) => { fonts[name] = await getPrintFont(session, `arial:${name}`, bytes[index + 1]); }));
  const checkupDate = formatDateForPrint(data.checkupDate || getTodayInVietnam());
  const targetPayment = data.targetPayment ?? getDefaultTargetPaymentByReason(data.checkupReason, Boolean(data.workplace));
  const fullName = (data.fullName || '').trim().toUpperCase();
  const birthDate = formatDateForPrint(data.birthDate);
  const history = data.medicalHistory;
  const values: Record<string, string> = {
    fullName, birthDate,
    footerIdentity: [fullName, birthDate].filter(Boolean).join(' - '),
    documentNumber: `${(data.cccd || '').trim()}/${checkupDate.replaceAll('/', '')}/GKSK-DYM`,
    cccd: data.cccd || '', ethnicity: data.ethnicity || '', bloodGroup: data.bloodGroup || '',
    insuranceNumber: data.insuranceNumber || '', addressDetail: data.addressDetail || '',
    homeWard: [data.ward, data.province].filter(Boolean).join(', '), occupation: data.occupation || '',
    workplace: data.workplace || '', workplaceWard: data.workplaceWard || '',
    phoneNumber: data.phoneNumber || '', email: data.email || '', checkupReason: data.checkupReason || '',
    checkupDate, targetGroup: targetPayment.targetGroup === 'other' ? targetPayment.targetOtherDetails : targetPayment.targetGroup,
    paymentSource: formatPaymentSource(targetPayment, info.key !== 'vnm'),
    familyDetails: history?.familyHistory?.hasDisease ? history.familyHistory.diseaseDetails : '',
    medications: history?.currentTreatment?.isTreating ? history.currentTreatment.medications : '',
    pregnancyDetails: data.gender === 'Nữ' && history?.pregnancyHistory?.hasHistory ? history.pregnancyHistory.details : '',
    personalOtherDetails: history?.personalHistory?.[22] ? history.personalOtherDetails : '',
  };
  for (const field of layout.fields) {
    const text = (values[field.field] || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const font = fonts[field.font];
    const size = Math.min(field.size, field.width / font.widthOfTextAtSize(text, 1));
    const width = font.widthOfTextAtSize(text, size);
    pages[field.page].drawText(text, { x: field.align === 'center' ? field.x - width / 2 : field.x,
      y: field.y, size, font, color: rgb(0, 0, 0) });
  }
  const tick = (point: { page: number; x: number; y: number }) => {
    drawPdfCheck(pages[point.page], point.x, point.y);
  };
  tick(layout.checks.gender[data.gender]);
  // Missing history is left blank, never asserted as a negative answer.
  if (history) {
    tick(layout.checks.familyHistory[history.familyHistory.hasDisease ? 'yes' : 'no']);
    for (const [id, points] of Object.entries(layout.checks.personalHistory)) {
      if (typeof history.personalHistory[Number(id)] === 'boolean') tick(points[history.personalHistory[Number(id)] ? 'yes' : 'no']);
    }
    tick(layout.checks.currentTreatment[history.currentTreatment.isTreating ? 'yes' : 'no']);
    if (data.gender === 'Nữ' && history.pregnancyHistory) tick(layout.checks.pregnancyHistory[history.pregnancyHistory.hasHistory ? 'yes' : 'no']);
  }
}

export async function appendTT25PrintPdf(data: TT25RegistrationData, session: PdfPrintSession, padForDuplex = false): Promise<void> {
  const start = session.pdf.getPageCount();
  await appendTT25OriginalPdf(data, session);
  const count = session.pdf.getPageCount() - start;
  const indices = Array.from({ length: count }, (_, index) => start + index);
  for (let copy = 1; copy < getTT25PrintCopies(data); copy++) {
    // Each complete copy starts on the front of a sheet when printing duplex.
    if (padForDuplex && count % 2 === 1) {
      const { width, height } = session.pdf.getPage(start).getSize();
      session.pdf.addPage([width, height]);
    }
    const pages = await session.pdf.copyPages(session.pdf, indices);
    for (const page of pages) session.pdf.addPage(page);
  }
}

export async function generateTT25OriginalPdf(data: TT25RegistrationData): Promise<{ blob: Blob; url: string }> {
  if (getTT25TemplateInfo(data).key === 'legacy' && getTT25PrintCopies(data) === 1) {
    const legacy = await import('./tt25PdfService');
    return legacy.generateTT25OriginalPdf(data);
  }
  const session = await createPdfPrintSession();
  await appendTT25PrintPdf(data, session, true);
  const output = await session.pdf.save();
  const blob = new Blob([output as BlobPart], { type: 'application/pdf' });
  return { blob, url: URL.createObjectURL(blob) };
}
