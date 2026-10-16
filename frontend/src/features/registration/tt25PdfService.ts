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
  const fetchUrl = `${url}?t=${Date.now()}`;
  console.log(`[TT25] Fetching ${description} from ${fetchUrl}`);
  
  // Try XHR first as it is the most reliable for binary ArrayBuffers in browsers
  try {
    const xhrBuf = await fetchBinaryWithXHR(fetchUrl);
    if (xhrBuf && xhrBuf.byteLength > 0) {
      console.log(`[TT25] ${description} loaded via XHR: ${xhrBuf.byteLength} bytes`);
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
  console.log(`[TT25] ${description} loaded via fetch: ${buf.byteLength} bytes`);
  return buf;
}

async function loadAssets() {
  if (!cachedTemplateBytes) {
    cachedTemplateBytes = await fetchAssetBuffer('/templates/mau-03-tt25.pdf', 'Mau 03 PDF template');
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
  _registrationNumber?: string
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

  const srcDoc = await PDFDocument.load(templateUint8);
  srcDoc.registerFontkit(fk);

  // Create a 2-page document extracting the first 2 pages of Mau 03
  const outDoc = await PDFDocument.create();
  outDoc.registerFontkit(fk);
  const [page1, page2] = await outDoc.copyPages(srcDoc, [0, 1]);
  outDoc.addPage(page1);
  outDoc.addPage(page2);

  const fontReg = await outDoc.embedFont(fontRegUint8);
  const fontBld = await outDoc.embedFont(fontBldUint8);

  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);

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
  // Giữ nguyên phần góc trên bên trái (để trống/dấu chấm như trong mẫu gốc của Bộ Y tế)

  // 1. Họ và tên (in hoa đậm)
  drawCleanText(page1, (data.fullName || '').toUpperCase(), 216, 570.6, 10.5, true);

  // 2. Giới tính
  if (data.gender === 'Nam') {
    drawVectorCheck(page1, 132.86, 560.62);
  } else if (data.gender === 'Nữ') {
    drawVectorCheck(page1, 174.98, 560.62);
  }

  // 3. Ngày tháng năm sinh (dd/mm/yyyy)
  let birthDateFormatted = data.birthDate || '';
  if (birthDateFormatted.includes('-')) {
    const [y, m, d] = birthDateFormatted.split('-');
    if (y && m && d) birthDateFormatted = `${d}/${m}/${y}`;
  }
  drawCleanText(page1, birthDateFormatted, 185, 543.3, 10, false);

  // 4. Dân tộc
  drawCleanText(page1, data.ethnicity || 'Kinh', 120, 529.8, 10, false);

  // 5. Nhóm máu
  drawCleanText(page1, data.bloodGroup || 'Chưa rõ', 185, 516.1, 10, false);

  // 6. Số CCCD (12 ô vuông)
  const cccd = (data.cccd || '').replace(/\D/g, '');
  const cccdXs = [255.5, 270.9, 286.3, 301.6, 317.0, 332.4, 347.7, 363.1, 378.4, 393.8, 409.1, 424.4];
  for (let i = 0; i < 12; i++) {
    const digit = cccd[i];
    if (digit) {
      page1.drawText(digit, { x: cccdXs[i] + 2.5, y: 502.5, size: 9, font: fontBld, color: black });
    }
  }

  // 7. Số thẻ BHYT (2 chữ cái + 13 chữ số)
  const bhytClean = (data.insuranceNumber || '').replace(/[^a-zA-Z0-9]/g, '');
  const bhytPrefix = [148.5, 163.8];
  const bhytSuffix = [185.5, 200.9, 216.3, 231.7, 247.0, 262.3, 277.6, 293.0, 308.3, 323.7, 339.1, 354.4, 369.8];
  if (bhytClean.length >= 2) {
    page1.drawText(bhytClean[0] || '', { x: bhytPrefix[0] + 2.5, y: 488.9, size: 9, font: fontBld, color: black });
    page1.drawText(bhytClean[1] || '', { x: bhytPrefix[1] + 2.5, y: 488.9, size: 9, font: fontBld, color: black });
    for (let i = 0; i < 13; i++) {
      const char = bhytClean[i + 2];
      if (char) {
        page1.drawText(char, { x: bhytSuffix[i] + 2.5, y: 488.9, size: 9, font: fontBld, color: black });
      }
    }
  }

  // 8. Nơi ở hiện tại & Xã phường
  drawCleanText(page1, data.addressDetail || '', 151, 475.5, 10, false);
  const wardProvince = [data.ward, data.province].filter(Boolean).join(', ');
  drawCleanText(page1, wardProvince, 135, 460.8, 10, false);

  // 9. Nghề nghiệp
  drawCleanText(page1, data.occupation || '', 149, 445.2, 10, false);

  // 10. Nơi làm việc, học tập & Xã phường
  drawCleanText(page1, data.workplace || '', 184, 431.7, 10, false);
  drawCleanText(page1, data.workplaceWard || '', 135, 417.0, 10, false);

  // 11. Điện thoại di động
  drawCleanText(page1, data.phoneNumber || '', 175, 401.4, 10, true);

  // 12. Lý do khám sức khỏe
  drawCleanText(page1, data.checkupReason || 'Khám sức khỏe tổng quát', 185, 387.9, 10, false);

  // TIỀN SỬ GIA ĐÌNH
  const hasFamilyDisease = Boolean(data.medicalHistory?.familyHistory?.hasDisease);
  if (!hasFamilyDisease) {
    drawVectorCheck(page1, 76.0, 281.0);
  } else {
    drawVectorCheck(page1, 76.0, 266.3);
    drawCleanText(page1, data.medicalHistory?.familyHistory?.diseaseDetails || '', 195, 262.6, 10, false);
  }

  // TIỀN SỬ BẢN THÂN TRANG 1: Mục 1 - 4 & Mục 12 - 15
  const personal = data.medicalHistory?.personalHistory || {};
  const tableRowsP1 = [
    { idLeft: 1, idRight: 12, y: 210.41 },
    { idLeft: 2, idRight: 13, y: 185.19 },
    { idLeft: 3, idRight: 14, y: 159.92 },
    { idLeft: 4, idRight: 15, y: 122.78 },
  ];

  for (const row of tableRowsP1) {
    // Left column
    if (personal[row.idLeft]) {
      drawVectorCheck(page1, 288.23, row.y); // Có
    } else {
      drawVectorCheck(page1, 317.16, row.y); // Không
    }
    // Right column
    if (personal[row.idRight]) {
      drawVectorCheck(page1, 500.14, row.y); // Có
    } else {
      drawVectorCheck(page1, 533.56, row.y); // Không
    }
  }

  // ========================== PAGE 2 ==========================
  // TIỀN SỬ BẢN THÂN TRANG 2: Mục 5 - 11 & Mục 16 - 22
  const tableRowsP2 = [
    { idLeft: 5, idRight: 16, y: 744.60 },
    { idLeft: 6, idRight: 17, y: 706.73 },
    { idLeft: 7, idRight: 18, y: 668.80 },
    { idLeft: 8, idRight: 19, y: 637.24 },
    { idLeft: 9, idRight: 20, y: 605.74 },
    { idLeft: 10, idRight: 21, y: 574.24 },
    { idLeft: 11, idRight: 22, y: 539.66 },
  ];

  for (const row of tableRowsP2) {
    // Left column
    if (personal[row.idLeft]) {
      drawVectorCheck(page2, 288.23, row.y); // Có
    } else {
      drawVectorCheck(page2, 317.16, row.y); // Không
    }
    // Right column
    if (personal[row.idRight]) {
      drawVectorCheck(page2, 500.14, row.y); // Có
    } else {
      drawVectorCheck(page2, 533.56, row.y); // Không
    }
  }

  // Bệnh khác (ghi rõ) nếu có
  if (personal[22] && data.medicalHistory?.personalOtherDetails) {
    drawCleanText(page2, data.medicalHistory.personalOtherDetails, 410, 524, 9.5, false);
  }

  // 3. Câu hỏi khác
  // a) Đang điều trị bệnh
  const isTreating = Boolean(data.medicalHistory?.currentTreatment?.isTreating);
  if (!isTreating) {
    drawVectorCheck(page2, 90.47, 475.03, 6.2);
  } else {
    drawVectorCheck(page2, 90.47, 460.27, 6.2);
    drawCleanText(page2, data.medicalHistory?.currentTreatment?.medications || '', 75, 442.1, 9.5, false);
  }

  // b) Tiền sử thai sản (nữ)
  const hasPregnancy = Boolean(data.medicalHistory?.pregnancyHistory?.hasHistory);
  if (!hasPregnancy) {
    drawVectorCheck(page2, 90.47, 416.35, 6.2);
  } else {
    drawVectorCheck(page2, 90.47, 401.71, 6.2);
    drawCleanText(page2, data.medicalHistory?.pregnancyHistory?.details || '', 75, 383.6, 9.5, false);
  }

  // Cam kết & Ký tên
  const now = new Date();
  const day = now.getDate().toString().padStart(2, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear().toString();

  // Template date line layout: ".............. ngày ........ tháng ....... năm .........."
  // Clear the dotted areas between "ngày", "tháng", and "năm" cleanly without colliding with words:
  // "ngày" ends at 395.33, "tháng" starts at 422.83 -> day dots: 398.09 to 420.07 -> slot [397.0, 421.5] (center 409.25)
  // "tháng" ends at 447.91, "năm" starts at 467.11 -> month dots: 447.91 to 467.11 -> slot [448.0, 467.0] (center 457.5)
  // "năm" ends at 486.12, dots continue to 513.58 -> year slot [486.5, 515.0] (center 500.75)
  page2.drawRectangle({ x: 397.0, y: 361.0, width: 24.5, height: 13.0, color: white });
  page2.drawRectangle({ x: 448.0, y: 361.0, width: 19.0, height: 13.0, color: white });
  page2.drawRectangle({ x: 486.5, y: 361.0, width: 28.5, height: 13.0, color: white });

  const dayWidth = fontReg.widthOfTextAtSize(day, 10);
  const monthWidth = fontReg.widthOfTextAtSize(month, 10);
  const yearWidth = fontReg.widthOfTextAtSize(year, 10);

  page2.drawText(day, {
    x: 409.25 - dayWidth / 2,
    y: 362.93,
    size: 10,
    font: fontReg,
    color: black,
  });
  page2.drawText(month, {
    x: 457.5 - monthWidth / 2,
    y: 362.93,
    size: 10,
    font: fontReg,
    color: black,
  });
  page2.drawText(year, {
    x: 500.75 - yearWidth / 2,
    y: 362.93,
    size: 10,
    font: fontReg,
    color: black,
  });

  // Thông tin đối tượng - chi trả & Địa điểm khám: để trống như biểu mẫu gốc

  const pdfBytes = await outDoc.save();
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  return { blob, url };
}

