import { formatQueueNumber } from '../../../lib/queueNumber';
import type { BranchCode } from '../../../types/domain';
import { getDefaultTargetPaymentByReason } from '../../registration/tt25Types';
import type { RegistrationDetails } from '../types';
import {
  calculateAge,
  formatBirthDate,
  formatFullAddress,
  formatRegistrationTime,
} from './adminFormatters';

function escapeXml(value: string): string {
  let cleaned = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      code >= 0x20
    ) {
      cleaned += value[i];
    }
  }
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnLetter(colIndexOneBased: number): string {
  let index = colIndexOneBased;
  let letter = '';
  while (index > 0) {
    const mod = (index - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    index = Math.floor((index - 1) / 26);
  }
  return letter;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function createZipArchive(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = entry.data;
    const crc = crc32(dataBytes);

    // Local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true); // signature
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0x0800, true); // UTF-8 flag
    localView.setUint16(8, 0, true); // store method (no compression)
    localView.setUint16(10, 0, true); // mod time
    localView.setUint16(12, 0x21, true); // mod date
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central directory header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true); // signature
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0x0800, true); // UTF-8 flag
    centralView.setUint16(10, 0, true); // store method
    centralView.setUint16(12, 0, true); // mod time
    centralView.setUint16(14, 0x21, true); // mod date
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  let centralSize = 0;
  for (const part of centralParts) {
    centralSize += part.length;
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true);

  const totalLength = offset + centralSize + eocd.length;
  const output = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of localParts) {
    output.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    output.set(part, pos);
    pos += part.length;
  }
  output.set(eocd, pos);

  return output;
}

function formatTargetPaymentText(row: RegistrationDetails): string {
  const extras = row.tt25_data ?? {};
  const defaultReason = row.company_name?.trim()
    ? 'Khám sức khỏe định kỳ theo công ty'
    : 'Khám sức khỏe cá nhân tự nguyện';
  const resolvedReason =
    extras.checkupReason && extras.checkupReason !== 'Khám sức khỏe tổng quát'
      ? extras.checkupReason
      : defaultReason;
  const tp =
    extras.targetPayment ?? getDefaultTargetPaymentByReason(resolvedReason);

  const targetStr = tp.targetGroup === '16' ? 'Công ty' : 'Cá nhân';

  let payStr = 'Tự chi trả';
  if (tp.paymentSource === 'employer') {
    payStr = 'Công ty';
  } else if (tp.paymentSource === 'other') {
    payStr = tp.paymentOtherDetails?.trim()
      ? `Bảo hiểm (${tp.paymentOtherDetails.trim()})`
      : 'Bảo hiểm';
  }

  return `${targetStr} | ${payStr}`;
}

export function exportRegistrationsToExcel({
  rows,
  branch,
  date,
}: {
  rows: RegistrationDetails[];
  branch: BranchCode;
  date: string;
}): void {
  if (!rows.length) return;

  const headers = [
    'STT',
    'Số phiếu',
    'Ngày khám',
    'Giờ đăng ký',
    'Họ và tên',
    'Giới tính',
    'Ngày sinh',
    'Tuổi',
    'Số điện thoại',
    'Số CCCD / Hộ chiếu',
    'Số thẻ BHYT',
    'Dân tộc',
    'Nhóm máu',
    'Nghề nghiệp',
    'Đơn vị công tác (Công ty)',
    'Địa chỉ nơi làm việc',
    'Địa chỉ hiện tại',
    'Lý do khám',
    'Đối tượng & Chi trả',
  ];

  const colWidths = [
    6, // STT
    10, // Số phiếu
    13, // Ngày khám
    12, // Giờ đăng ký
    26, // Họ và tên
    10, // Giới tính
    13, // Ngày sinh
    8, // Tuổi
    15, // SĐT
    18, // CCCD
    18, // BHYT
    11, // Dân tộc
    11, // Nhóm máu
    22, // Nghề nghiệp
    30, // Đơn vị công tác
    28, // Địa chỉ nơi làm việc
    38, // Địa chỉ hiện tại
    28, // Lý do khám
    28, // Đối tượng & Chi trả
  ];

  const colsXml = colWidths
    .map(
      (w, idx) =>
        `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`,
    )
    .join('');

  const xmlRows: string[] = [];

  // Header row (Row 1, style s="1")
  const headerCells = headers
    .map((h, idx) => {
      const ref = `${columnLetter(idx + 1)}1`;
      return `<c r="${ref}" s="1" t="inlineStr"><is><t>${escapeXml(h)}</t></is></c>`;
    })
    .join('');
  xmlRows.push(`<row r="1" ht="26" customHeight="1">${headerCells}</row>`);

  // Data rows
  rows.forEach((row, index) => {
    const excelRowIdx = index + 2;
    const extras = row.tt25_data ?? {};
    const age = calculateAge(row.birth_date);
    const defaultReason = row.company_name?.trim()
      ? 'Khám sức khỏe định kỳ theo công ty'
      : 'Khám sức khỏe cá nhân tự nguyện';
    const resolvedReason =
      extras.checkupReason && extras.checkupReason !== 'Khám sức khỏe tổng quát'
        ? extras.checkupReason
        : defaultReason;

    const wpWard = extras.workplaceWard || '';
    const wpProv = extras.workplaceProvince || '';
    const resolvedWorkplaceAddress =
      wpProv && !wpWard.includes(wpProv)
        ? [wpWard, wpProv].filter(Boolean).join(', ')
        : wpWard;

    const values: Array<{ val: string | number; isNum?: boolean; center?: boolean }> = [
      { val: index + 1, isNum: true, center: true },
      { val: formatQueueNumber(row.queue_number), center: true },
      { val: formatBirthDate(row.queue_date), center: true },
      { val: formatRegistrationTime(row.registered_at), center: true },
      { val: row.full_name || '' },
      { val: row.gender || '', center: true },
      { val: formatBirthDate(row.birth_date), center: true },
      { val: age !== null ? age : '', isNum: age !== null, center: true },
      { val: row.phone_number || '' },
      { val: row.identity_document || '' },
      { val: extras.insuranceNumber || '' },
      { val: extras.ethnicity || 'Kinh', center: true },
      { val: extras.bloodGroup || 'Chưa rõ', center: true },
      { val: extras.occupation || '' },
      { val: row.company_name || '' },
      { val: resolvedWorkplaceAddress },
      {
        val: formatFullAddress(row.address_detail, row.ward, row.province),
      },
      { val: resolvedReason },
      { val: formatTargetPaymentText(row) },
    ];

    const rowCells = values
      .map((cell, cIdx) => {
        const ref = `${columnLetter(cIdx + 1)}${excelRowIdx}`;
        const styleId = cell.center ? '3' : '2';
        if (cell.isNum && typeof cell.val === 'number') {
          return `<c r="${ref}" s="${styleId}" t="n"><v>${cell.val}</v></c>`;
        }
        return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t>${escapeXml(String(cell.val ?? ''))}</t></is></c>`;
      })
      .join('');

    xmlRows.push(
      `<row r="${excelRowIdx}" ht="20" customHeight="1">${rowCells}</row>`,
    );
  });

  const lastColLetter = columnLetter(headers.length);
  const lastRowNumber = rows.length + 1;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>${colsXml}</cols>
  <sheetData>${xmlRows.join('')}</sheetData>
  <autoFilter ref="A1:${lastColLetter}${lastRowNumber}"/>
</worksheet>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><color rgb="FF0F172A"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF102B4E"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Danh sach tiep nhan" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const encoder = new TextEncoder();
  const zipBytes = createZipArchive([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml) },
  ]);

  const blob = new Blob([zipBytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `DS-Tiep-Nhan_${branch.toUpperCase()}_${date}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
