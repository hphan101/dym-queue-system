import { columnLetter, createZipArchive, escapeXml, neutralizeSpreadsheetFormula } from '../../../lib/xlsx';
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
    'Tên khách hàng',
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
    'Ghi chú / STT HIS',
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
    35, // Ghi chú / STT HIS
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
      { val: row.reception_note || '' },
    ];

    const rowCells = values
      .map((cell, cIdx) => {
        const ref = `${columnLetter(cIdx + 1)}${excelRowIdx}`;
        const styleId = cell.center ? '3' : '2';
        if (cell.isNum && typeof cell.val === 'number') {
          return `<c r="${ref}" s="${styleId}" t="n"><v>${cell.val}</v></c>`;
        }
        const rawText = String(cell.val ?? '');
        const safeText = neutralizeSpreadsheetFormula(rawText);
        return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t>${escapeXml(safeText)}</t></is></c>`;
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
