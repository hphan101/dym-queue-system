import { PDFDocument, rgb, LineCapStyle } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { TT25RegistrationData } from './tt25Types';

// Cached font & template buffers to avoid re-fetching on every modal open
let cachedTemplateBytes: ArrayBuffer | null = null;
let cachedFontRegBytes: ArrayBuffer | null = null;
let cachedFontBldBytes: ArrayBuffer | null = null;

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
  const fetchUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
  
  // Try XHR first as it is the most reliable for binary ArrayBuffers in browsers
  try {
    const xhrBuf = await fetchBinaryWithXHR(fetchUrl);
    if (xhrBuf && xhrBuf.byteLength > 0) {
      return xhrBuf;
    }
  } catch (xhrErr) {
    console.warn(`[TT25] XHR attempt failed for ${description}, trying fetch:`, xhrErr);
  }

  // Fallback to fetch
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

async function loadAssets() {
  if (!cachedTemplateBytes) {
    cachedTemplateBytes = await fetchAssetBuffer('/templates/mau-03-tt25.pdf?v=4', 'Mau 03 DYM 7-page PDF template');
  }
  if (!cachedFontRegBytes) {
    cachedFontRegBytes = await fetchAssetBuffer('/fonts/times.ttf', 'Times font regular');
  }
  if (!cachedFontBldBytes) {
    cachedFontBldBytes = await fetchAssetBuffer('/fonts/timesbd.ttf', 'Times font bold');
  }
  return {
    templateBytes: cachedTemplateBytes,
    fontRegBytes: cachedFontRegBytes,
    fontBldBytes: cachedFontBldBytes,
  };
}

export async function generateTT25OriginalPdf(
  data: TT25RegistrationData,
): Promise<{ blob: Blob; url: string }> {
  const { templateBytes, fontRegBytes, fontBldBytes } = await loadAssets();

  // Create fresh copy of bytes so ArrayBuffer is never detached or mutated across runs
  const templateUint8 = new Uint8Array(templateBytes.slice(0));
  const fontRegUint8 = new Uint8Array(fontRegBytes.slice(0));
  const fontBldUint8 = new Uint8Array(fontBldBytes.slice(0));

  // Check PDF magic header '%PDF'
  const header = String.fromCharCode(templateUint8[0], templateUint8[1], templateUint8[2], templateUint8[3]);
  if (header !== '%PDF') {
    throw new Error(`Invalid PDF header: expected '%PDF' but received '${header}' (length ${templateUint8.length})`);
  }

  // Handle both ESM and CJS fontkit module shapes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fk = (fontkit as any)?.default || fontkit;

  const outDoc = await PDFDocument.load(templateUint8);
  outDoc.registerFontkit(fk);

  const pages = outDoc.getPages();
  const page1 = pages[0];
  const page2 = pages[1];

  const fontReg = await outDoc.embedFont(fontRegUint8);
  const fontBld = await outDoc.embedFont(fontBldUint8);

  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);

  // Parse checkup date (or fallback to current date)
  const now = new Date();
  let day = now.getDate().toString().padStart(2, '0');
  let month = (now.getMonth() + 1).toString().padStart(2, '0');
  let year = now.getFullYear().toString();
  if (data.checkupDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(data.checkupDate)) {
      const [y, m, d] = data.checkupDate.split('-');
      day = d;
      month = m;
      year = y;
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(data.checkupDate)) {
      const [d, m, y] = data.checkupDate.split('/');
      day = d;
      month = m;
      year = y;
    }
  }

  // Helper to cover dotted lines with a small white rectangle and write clear text
  const drawCleanText = (
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    size = 10,
    isBold = false
  ) => {
    if (!text) return;
    const font = isBold ? fontBld : fontReg;
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawRectangle({
      x: x - 1,
      y: y - 2,
      width: textWidth + 3,
      height: size + 3,
      color: white,
    });
    page.drawText(text, {
      x,
      y,
      size,
      font,
      color: black,
    });
  };

  // Helper to draw clean vector checkmark (✓) inside checkboxes
  // Completely immune to missing glyphs in TrueType fonts
  const drawVectorCheck = (
    page: PDFPage,
    centerX: number,
    centerY: number,
    size = 7.5
  ) => {
    const leftX = centerX - size * 0.36;
    const leftY = centerY + size * 0.05;
    const midX = centerX - size * 0.08;
    const midY = centerY - size * 0.35;
    const rightX = centerX + size * 0.42;
    const rightY = centerY + size * 0.42;
    const thickness = size < 7 ? 1.2 : 1.35;

    page.drawLine({
      start: { x: leftX, y: leftY },
      end: { x: midX, y: midY },
      thickness,
      color: black,
      lineCap: LineCapStyle.Round,
    });
    page.drawLine({
      start: { x: midX, y: midY },
      end: { x: rightX, y: rightY },
      thickness,
      color: black,
      lineCap: LineCapStyle.Round,
    });
  };

  // ========================== PAGE 1 ==========================
  // Số: [CCCD/ngaythangnamkham]/GKSK - DYM
  const docIdText = (data.cccd || '').trim().toUpperCase();
  const soNumberText = docIdText
    ? `${docIdText}/${day}${month}${year}/GKSK - DYM`
    : `/${day}${month}${year}/GKSK - DYM`;
  page1.drawText(soNumberText, {
    x: 94.9,
    y: 699.8,
    size: 11,
    font: fontReg,
    color: black,
  });

  // 1. Họ và tên (in hoa đậm)
  drawCleanText(page1, (data.fullName || '').toUpperCase(), 202, 593.9, 10.5, true);

  // 2. Giới tính
  if (data.gender === 'Nam') {
    drawVectorCheck(page1, 132.86, 583.9);
  } else if (data.gender === 'Nữ') {
    drawVectorCheck(page1, 174.98, 583.9);
  }

  // 3. Ngày tháng năm sinh (dd/mm/yyyy)
  let birthDateFormatted = data.birthDate || '';
  if (birthDateFormatted.includes('-')) {
    const [y, m, d] = birthDateFormatted.split('-');
    if (y && m && d) birthDateFormatted = `${d}/${m}/${y}`;
  }
  drawCleanText(page1, birthDateFormatted, 182, 566.6, 10, false);

  // 4. Dân tộc
  drawCleanText(page1, data.ethnicity || 'Kinh', 123, 553.0, 10, false);

  // 5. Nhóm máu
  drawCleanText(page1, data.bloodGroup || 'Chưa rõ', 177, 539.5, 10, false);

  // 6. Số CCCD (12 ô vuông)
  const cccd = (data.cccd || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const cccdXs = [255.5, 270.9, 286.3, 301.6, 317.0, 332.4, 347.7, 363.1, 378.4, 393.8, 409.1, 424.4];
  for (let i = 0; i < 12; i++) {
    const digit = cccd[i];
    if (digit) {
      page1.drawText(digit, { x: cccdXs[i] + 2.5, y: 525.8, size: 9, font: fontBld, color: black });
    }
  }

  // 7. Số thẻ BHYT (2 chữ cái + 13 chữ số)
  const bhytClean = (data.insuranceNumber || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const bhytPrefix = [148.5, 163.8];
  const bhytSuffix = [185.5, 200.9, 216.3, 231.7, 247.0, 262.3, 277.6, 293.0, 308.3, 323.7, 339.1, 354.4, 369.8];
  if (bhytClean.length >= 2) {
    page1.drawText(bhytClean[0] || '', { x: bhytPrefix[0] + 2.5, y: 512.2, size: 9, font: fontBld, color: black });
    page1.drawText(bhytClean[1] || '', { x: bhytPrefix[1] + 2.5, y: 512.2, size: 9, font: fontBld, color: black });
    for (let i = 0; i < 13; i++) {
      const char = bhytClean[i + 2];
      if (char) {
        page1.drawText(char, { x: bhytSuffix[i] + 2.5, y: 512.2, size: 9, font: fontBld, color: black });
      }
    }
  }

  // 8. Nơi ở hiện tại & Xã phường
  drawCleanText(page1, data.addressDetail || '', 151, 498.7, 10, false);
  const wardProvince = [data.ward, data.province].filter(Boolean).join(', ');
  drawCleanText(page1, wardProvince, 134, 486.0, 10, false);

  // 9. Nghề nghiệp
  drawCleanText(page1, data.occupation || '', 153, 470.5, 10, false);

  // 10. Nơi làm việc, học tập & Xã phường
  drawCleanText(page1, data.workplace || '', 183, 456.9, 10, false);
  drawCleanText(page1, data.workplaceWard || '', 134, 444.2, 10, false);

  // 11. Điện thoại di động
  drawCleanText(page1, data.phoneNumber || '', 171, 428.7, 10, true);

  // 12. Lý do khám sức khỏe (tick 1 trong 3 ô vuông bên dưới)
  const reasonNorm = (data.checkupReason || '').toLowerCase();
  if (reasonNorm.includes('công ty') || reasonNorm.includes('định kì') || reasonNorm.includes('định kỳ')) {
    drawVectorCheck(page1, 78.3, 406.1);
  } else if (reasonNorm.includes('đi học') || reasonNorm.includes('đi làm')) {
    drawVectorCheck(page1, 78.3, 387.1);
  } else if (reasonNorm.includes('cá nhân') || reasonNorm.includes('tự nguyện')) {
    drawVectorCheck(page1, 78.3, 368.1);
  } else if (data.checkupReason) {
    drawCleanText(page1, data.checkupReason, 182, 415.1, 10, false);
  }

  // TIỀN SỬ GIA ĐÌNH (Trang 1)
  const hasFamilyDisease = Boolean(data.medicalHistory?.familyHistory?.hasDisease);
  if (!hasFamilyDisease) {
    drawVectorCheck(page1, 76.0, 278.5);
  } else {
    drawVectorCheck(page1, 76.0, 264.0);
    drawCleanText(page1, data.medicalHistory?.familyHistory?.diseaseDetails || '', 194, 260.2, 10, false);
  }

  // TIỀN SỬ BẢN THÂN TRANG 1: Mục 1 - 4 & Mục 12 - 15
  const personal = data.medicalHistory?.personalHistory || {};
  const tableRowsP1 = [
    { idLeft: 1, idRight: 12, y: 205.2 },
    { idLeft: 2, idRight: 13, y: 180.0 },
    { idLeft: 3, idRight: 14, y: 154.7 },
    { idLeft: 4, idRight: 15, y: 117.6 },
  ];

  for (const row of tableRowsP1) {
    // Left column
    if (personal[row.idLeft]) {
      drawVectorCheck(page1, 288.25, row.y); // Có
    } else {
      drawVectorCheck(page1, 317.15, row.y); // Không
    }
    // Right column
    if (personal[row.idRight]) {
      drawVectorCheck(page1, 500.05, row.y); // Có
    } else {
      drawVectorCheck(page1, 533.55, row.y); // Không
    }
  }

  // ========================== PAGE 2 ==========================
  // TIỀN SỬ BẢN THÂN TRANG 2: Mục 5 - 11 & Mục 16 - 22
  const tableRowsP2 = [
    { idLeft: 5, idRight: 16, y: 716.2 },
    { idLeft: 6, idRight: 17, y: 678.3 },
    { idLeft: 7, idRight: 18, y: 640.5 },
    { idLeft: 8, idRight: 19, y: 609.0 },
    { idLeft: 9, idRight: 20, y: 577.4 },
    { idLeft: 10, idRight: 21, y: 545.8 },
    { idLeft: 11, idRight: 22, y: 511.3 },
  ];

  for (const row of tableRowsP2) {
    // Left column
    if (personal[row.idLeft]) {
      drawVectorCheck(page2, 288.25, row.y); // Có
    } else {
      drawVectorCheck(page2, 317.15, row.y); // Không
    }
    // Right column
    if (personal[row.idRight]) {
      drawVectorCheck(page2, 500.05, row.y); // Có
    } else {
      drawVectorCheck(page2, 533.55, row.y); // Không
    }
  }

  // Bệnh khác (ghi rõ) nếu có
  if (personal[22] && data.medicalHistory?.personalOtherDetails) {
    drawCleanText(page2, data.medicalHistory.personalOtherDetails, 359.5, 498.2, 9.5, false);
  }

  // 3. Câu hỏi khác
  // a) Đang điều trị bệnh
  const isTreating = Boolean(data.medicalHistory?.currentTreatment?.isTreating);
  if (!isTreating) {
    drawVectorCheck(page2, 90.5, 449.7, 6.2);
  } else {
    drawVectorCheck(page2, 90.5, 435.0, 6.2);
    drawCleanText(page2, data.medicalHistory?.currentTreatment?.medications || '', 75, 416.6, 9.5, false);
  }

  // b) Tiền sử thai sản (nữ)
  const hasPregnancy = Boolean(data.medicalHistory?.pregnancyHistory?.hasHistory);
  if (!hasPregnancy) {
    drawVectorCheck(page2, 90.5, 391.1, 6.2);
  } else {
    drawVectorCheck(page2, 90.5, 376.5, 6.2);
    drawCleanText(page2, data.medicalHistory?.pregnancyHistory?.details || '', 75, 358.0, 9.5, false);
  }

  // Cam kết & Ký tên (Trang 2)
  // Template date line layout: ".............. ngày ........ tháng ....... năm .........." at y = 337.5
  page2.drawRectangle({ x: 397.0, y: 335.6, width: 24.5, height: 13.0, color: white });
  page2.drawRectangle({ x: 448.0, y: 335.6, width: 19.0, height: 13.0, color: white });
  page2.drawRectangle({ x: 486.5, y: 335.6, width: 28.5, height: 13.0, color: white });

  const dayWidth = fontReg.widthOfTextAtSize(day, 10);
  const monthWidth = fontReg.widthOfTextAtSize(month, 10);
  const yearWidth = fontReg.widthOfTextAtSize(year, 10);

  page2.drawText(day, {
    x: 409.25 - dayWidth / 2,
    y: 337.5,
    size: 10,
    font: fontReg,
    color: black,
  });
  page2.drawText(month, {
    x: 457.5 - monthWidth / 2,
    y: 337.5,
    size: 10,
    font: fontReg,
    color: black,
  });
  page2.drawText(year, {
    x: 500.75 - yearWidth / 2,
    y: 337.5,
    size: 10,
    font: fontReg,
    color: black,
  });

  // ================= THÔNG TIN ĐỐI TƯỢNG - CHI TRẢ (Trang 2) =================
  const tp = data.targetPayment;
  const targetGroup = tp?.targetGroup;

  // 1. Đối tượng:
  // ☐ 14 – Sinh viên, học viên (y = 226.46 -> center 230.5)
  // ☐ 15 – Người lao động chính thức (y = 209.90 -> center 213.9)
  // ☐ 16 – Người lao động phi chính thức (y = 193.34 -> center 197.4)
  // Các đối tượng khác: ............ (y = 178.34)
  if (targetGroup === '14') {
    drawVectorCheck(page2, 76.8, 230.5, 6.5);
  } else if (targetGroup === '15') {
    drawVectorCheck(page2, 76.8, 213.9, 6.5);
  } else if (targetGroup === '16') {
    drawVectorCheck(page2, 76.8, 197.4, 6.5);
  } else if (targetGroup === 'other' && tp?.targetOtherDetails) {
    drawCleanText(page2, tp.targetOtherDetails, 164, 178.3, 10, false);
  }

  // 2. Nguồn chi trả:
  // ☐ Người sử dụng lao động chi trả (y = 149.28 -> center 153.3)
  // ☐ Người dân tự chi trả (y = 132.72 -> center 136.7)
  // ☐ Nguồn khác: ............ (y = 118.08 -> center 122.1)
  const paymentSource = tp?.paymentSource;
  if (paymentSource === 'employer') {
    drawVectorCheck(page2, 76.8, 153.3, 6.5);
  } else if (paymentSource === 'self') {
    drawVectorCheck(page2, 76.8, 136.7, 6.5);
  } else if (paymentSource === 'other') {
    drawVectorCheck(page2, 76.8, 122.1, 6.5);
    if (tp?.paymentOtherDetails) {
      drawCleanText(page2, tp.paymentOtherDetails, 144, 118.1, 10, false);
    }
  }

  // 3. Địa điểm khám (Mặc định auto tick □ CS KBCB tại x = 183.9, y = 106.9)
  const examLocation = tp?.examLocation || 'cs_kbcb';
  if (examLocation === 'cs_kbcb') {
    drawVectorCheck(page2, 183.9, 106.9, 6.2);
  } else if (examLocation === 'kham_luu_dong') {
    drawVectorCheck(page2, 255.9, 106.9, 6.2);
  } else if (examLocation === 'tram_y_te') {
    drawVectorCheck(page2, 340.9, 106.9, 6.2);
  } else if (examLocation === 'truong_hoc') {
    drawVectorCheck(page2, 399.2, 106.9, 6.2);
  } else if (examLocation === 'ksk_tai_nha') {
    drawVectorCheck(page2, 464.3, 106.9, 6.2);
  }

  // ========================== FOOTER (ALL PAGES) ==========================
  // Trái: [Họ tên khách] – [Ngày sinh khách] (tại x = 72.024, y = 38.52)
  // Phải: [CCCD/ngaythangnamkham]/GKSK - DYM (căn phải tại x = 538.2, y = 38.52)
  const footerLeftText = [(data.fullName || '').trim().toUpperCase(), birthDateFormatted]
    .filter(Boolean)
    .join(' – ');
  const footerRightWidth = fontReg.widthOfTextAtSize(soNumberText, 11);
  const footerRightX = Math.max(320, 538.2 - footerRightWidth);

  for (const p of pages) {
    if (footerLeftText) {
      p.drawText(footerLeftText, {
        x: 72.024,
        y: 38.52,
        size: 11,
        font: fontReg,
        color: black,
      });
    }
    p.drawText(soNumberText, {
      x: footerRightX,
      y: 38.52,
      size: 11,
      font: fontReg,
      color: black,
    });
  }

  const pdfBytes = await outDoc.save();
  const safeArrayBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([safeArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  return { blob, url };
}

