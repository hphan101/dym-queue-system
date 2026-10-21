import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { TT25RegistrationData } from './tt25Types';

let cachedConsentTemplateBytes: ArrayBuffer | null = null;
let cachedFontArialBldBytes: ArrayBuffer | null = null;
let cachedFontArialItaBytes: ArrayBuffer | null = null;
let cachedFontArialBldItaBytes: ArrayBuffer | null = null;

function fetchBinaryWithXHR(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        resolve(xhr.response as ArrayBuffer);
      } else {
        reject(new Error(`XHR failed: status ${xhr.status} for ${url}`));
      }
    };
    xhr.onerror = () => reject(new Error(`XHR network error for ${url}`));
    xhr.send();
  });
}

async function fetchAssetBuffer(url: string, description: string): Promise<ArrayBuffer> {
  const fetchUrl = `${url}?t=${Date.now()}`;
  try {
    const xhrBuf = await fetchBinaryWithXHR(fetchUrl);
    if (xhrBuf && xhrBuf.byteLength > 0) {
      return xhrBuf;
    }
  } catch (xhrErr) {
    console.warn(`[ConsentPDF] XHR attempt failed for ${description}, trying fetch:`, xhrErr);
  }

  const res = await fetch(fetchUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${description}: status ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  if (!buf || buf.byteLength === 0) {
    throw new Error(`Fetched ${description} is empty (0 bytes)`);
  }
  return buf;
}

async function loadConsentAssets() {
  if (!cachedConsentTemplateBytes) {
    cachedConsentTemplateBytes = await fetchAssetBuffer(
      '/templates/dong-thuan-kham.pdf',
      'Consent PDF template',
    );
  }
  if (!cachedFontArialBldBytes) {
    cachedFontArialBldBytes = await fetchAssetBuffer('/fonts/arialbd.ttf', 'Arial Bold font');
  }
  if (!cachedFontArialItaBytes) {
    cachedFontArialItaBytes = await fetchAssetBuffer('/fonts/ariali.ttf', 'Arial Italic font');
  }
  if (!cachedFontArialBldItaBytes) {
    cachedFontArialBldItaBytes = await fetchAssetBuffer(
      '/fonts/arialbi.ttf',
      'Arial Bold Italic font',
    );
  }
  return {
    templateBytes: cachedConsentTemplateBytes,
    fontBldBytes: cachedFontArialBldBytes,
    fontItaBytes: cachedFontArialItaBytes,
    fontBldItaBytes: cachedFontArialBldItaBytes,
  };
}

export function formatConsentDate(dateStr?: string): string {
  if (dateStr) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    }
    return dateStr;
  }
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

export type ConsentStatementMode = 'agree' | 'disagree' | 'blank';

export async function generateConsentPdf(
  data: TT25RegistrationData,
  statementMode: ConsentStatementMode = data.consentAgreed === false ? 'disagree' : 'agree',
): Promise<{ blob: Blob; url: string }> {
  const { templateBytes, fontBldBytes, fontItaBytes, fontBldItaBytes } = await loadConsentAssets();

  const templateUint8 = new Uint8Array(templateBytes.slice(0));
  const fontBldUint8 = new Uint8Array(fontBldBytes.slice(0));
  const fontItaUint8 = new Uint8Array(fontItaBytes.slice(0));
  const fontBldItaUint8 = new Uint8Array(fontBldItaBytes.slice(0));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fk = (fontkit as any)?.default || fontkit;

  const pdfDoc = await PDFDocument.load(templateUint8);
  pdfDoc.registerFontkit(fk);

  const page = pdfDoc.getPages()[0];
  const fontBld = await pdfDoc.embedFont(fontBldUint8);
  const fontIta = await pdfDoc.embedFont(fontItaUint8);
  const fontBldIta = await pdfDoc.embedFont(fontBldItaUint8);

  const black = rgb(0, 0, 0);
  const dymBlue = rgb(0, 0.439, 0.753); // #0070C0
  const dateBlue = rgb(0.18, 0.455, 0.71); // #2E74B5

  // 1. Số thứ tự / Order (top right under "Số thứ tự / Order" in Header)
  const queueText = (data.queueNumber || '').trim();
  if (queueText) {
    const qSize = 11;
    const qWidth = fontBld.widthOfTextAtSize(queueText, qSize);
    page.drawText(queueText, {
      x: 559.3 - qWidth,
      y: 789.5,
      size: qSize,
      font: fontBld,
      color: black,
    });
  }

  // 2. Ý kiến của Khách hàng / Customer's statement:
  if (statementMode !== 'blank') {
    const statementText =
      statementMode === 'agree'
        ? 'Tôi đồng ý / I agree'
        : 'Tôi không đồng ý / I do not agree';
    page.drawText(statementText, {
      x: 272,
      y: 143.06,
      size: 9.96,
      font: fontBld,
      color: black,
    });
  }

  // 3. Ngày / Date: [Chèn ngày khách khám]
  const checkupDateFormatted = formatConsentDate(data.checkupDate);
  page.drawText(checkupDateFormatted, {
    x: 115.94,
    y: 130.58,
    size: 9.96,
    font: fontIta,
    color: dateBlue,
  });

  // 4. KHÁCH HÀNG / CUSTOMER: [CHÈN TÊN KHÁCH]
  const customerName = (data.fullName || '').trim().toUpperCase();
  if (customerName) {
    page.drawText(customerName, {
      x: 199.5,
      y: 118.22,
      size: 9.96,
      font: fontBldIta,
      color: dymBlue,
    });
  }

  // 5. Số CCCD/mã định danh/Số Passport: [Chèn số CCCD/Số hộ chiếu của khách]
  const cccdText = (data.cccd || '').trim();
  if (cccdText) {
    page.drawText(cccdText, {
      x: 227.69,
      y: 105.86,
      size: 9.96,
      font: fontBldIta,
      color: dymBlue,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const safeArrayBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([safeArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  return { blob, url };
}
