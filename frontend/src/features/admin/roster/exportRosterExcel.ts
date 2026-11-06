import { getTodayInVietnam } from '../../../lib/date';
import { orderCampaignPositions } from './campaignPositionOrder';
import { columnLetter, createZipArchive, escapeXml, neutralizeSpreadsheetFormula, type ZipEntry } from '../../../lib/xlsx';
import {
  ROLE_SHORT_LABELS,
  getCountedProvisionalCost,
  ROSTER_BRANCH_LABELS,
  SCHEDULE_TYPE_LABELS,
  SHIFT_SHORT_LABELS,
  type ClinicRoom,
  type MedicalPersonnel,
  type RosterAssignment,
  type RosterSchedule,
} from './rosterService';
import { formatDisplayDate } from '../utils/adminFormatters';

/**
 * Style indices in buildStylesXml:
 * 0: Default
 * 1: Table Header (Navy #102B4E, White Bold, Center)
 * 2: Data Text Left (Thin Border)
 * 3: Data Text Center (Thin Border)
 * 4: Data Currency Right (#,##0, Thin Border)
 * 5: Summary Total Label (Light Slate #F1F5F9, Bold, Thin Border)
 * 6: Summary Total Currency (#,##0, Light Slate #F1F5F9, Bold, Thin Border)
 * 7: Title / Meta Bold Left (No border, Bold 12pt)
 * 8: Meta Text Left (No border, Regular 11pt)
 */
function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0"/>
  </numFmts>
  <fonts count="4">
    <font><sz val="11"/><color rgb="FF0F172A"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Arial"/></font>
    <font><b/><sz val="13"/><color rgb="FF102B4E"/><name val="Arial"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF102B4E"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
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
  <cellXfs count="9">
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
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="49" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;
}

function triggerXlsxDownload(sheets: Array<{ name: string; xml: string }>, filename: string): void {
  const encoder = new TextEncoder();
  const stylesXml = buildStylesXml();

  const sheetTags = sheets
    .map(
      (s, i) =>
        `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join('');

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetTags}</sheets>
</workbook>`;

  const sheetRels = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('');

  const stylesRelId = `rId${sheets.length + 1}`;
  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const sheetOverrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheetOverrides}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml) },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: encoder.encode(s.xml),
    })),
  ];

  const zipBytes = createZipArchive(entries);
  const blob = new Blob([zipBytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

interface CellSpec {
  val: string | number;
  styleId: number;
  isNum?: boolean;
}

function renderRowXml(rowNumber: number, height: number, cells: CellSpec[]): string {
  const cellsXml = cells
    .map((cell, idx) => {
      const ref = `${columnLetter(idx + 1)}${rowNumber}`;
      if (cell.isNum && typeof cell.val === 'number') {
        return `<c r="${ref}" s="${cell.styleId}" t="n"><v>${cell.val}</v></c>`;
      }
      const rawText = String(cell.val ?? '');
      const safeText = neutralizeSpreadsheetFormula(rawText);
      return `<c r="${ref}" s="${cell.styleId}" t="inlineStr"><is><t>${escapeXml(safeText)}</t></is></c>`;
    })
    .join('');
  return `<row r="${rowNumber}" ht="${height}" customHeight="1">${cellsXml}</row>`;
}

/**
 * 1. Xuất Excel Chi Phí Đoàn Khám / Lịch Trực
 */
export function exportScheduleCostExcel({
  schedule,
  assignments,
  personnelMap,
  roomMap,
}: {
  schedule: RosterSchedule;
  assignments: RosterAssignment[];
  personnelMap: Map<string, MedicalPersonnel>;
  roomMap: Map<string, ClinicRoom>;
}): void {
  const branchLabel =
    ROSTER_BRANCH_LABELS[schedule.branch_code as 'q1' | 'q7'] ??
    schedule.branch_code.toUpperCase();
  const scheduleTypeLabel = SCHEDULE_TYPE_LABELS[schedule.schedule_type];
  const displayDate = formatDisplayDate(schedule.schedule_date);

  const colWidths = [
    6, // STT
    24, // Phòng / Vị trí
    14, // Mã nhân sự (ID)
    26, // Họ và tên
    14, // Vai trò
    15, // SĐT
    14, // Ca trực
    18, // Cost cố định
    18, // Phụ cấp
    20, // Tổng chi phí
    28, // Ghi chú
  ];

  const colsXml = colWidths
    .map(
      (w, idx) =>
        `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`,
    )
    .join('');

  const xmlRows: string[] = [];
  let rowCursor = 1;

  const titleText =
    schedule.schedule_type === 'insite'
      ? `BẢNG CHI PHÍ LỊCH TRỰC PHÒNG KHÁM (${branchLabel}) — NGÀY ${displayDate}`
      : `BẢNG CHI PHÍ ĐOÀN KHÁM NGOẠI VIỆN — ${schedule.campaign_code || ''} — ${schedule.company_name || ''}`;

  xmlRows.push(
    renderRowXml(rowCursor++, 26, [{ val: titleText, styleId: 7 }]),
  );

  const metaLines: string[] = [
    `Loại lịch: ${scheduleTypeLabel} | Cơ sở: ${branchLabel} | Ngày thực hiện: ${displayDate}`,
  ];
  if (schedule.schedule_type !== 'insite') {
    metaLines.push(
      `Mã đoàn: ${schedule.campaign_code || '—'} | Công ty: ${schedule.company_name || '—'} | Người phụ trách: ${schedule.contact_person || '—'}`,
    );
    metaLines.push(`Cơ sở ký hợp đồng: ${branchLabel}`);
    metaLines.push(`Sales phụ trách: ${schedule.sales_person || '—'}`);
    metaLines.push(`Địa chỉ xuất phát: ${schedule.departure_address || '—'}`);
    metaLines.push(`Địa chỉ khám: ${schedule.company_address || '—'}`);
  }
  if (schedule.notes) {
    metaLines.push(`Ghi chú điều phối: ${schedule.notes}`);
  }

  for (const line of metaLines) {
    xmlRows.push(renderRowXml(rowCursor++, 20, [{ val: line, styleId: 8 }]));
  }

  // Blank separator row
  rowCursor++;

  const headers = [
    'STT',
    schedule.schedule_type === 'insite' ? 'Phòng khám' : 'Vị trí / Bàn khám',
    'Mã nhân sự (ID)',
    'Họ và tên nhân sự',
    'Vai trò',
    'Số điện thoại',
    'Ca làm việc',
    'Cost cố định (VNĐ)',
    'Phụ cấp (VNĐ)',
    'Tổng chi phí (VNĐ)',
    'Ghi chú',
  ];

  xmlRows.push(
    renderRowXml(
      rowCursor++,
      26,
      headers.map((h) => ({ val: h, styleId: 1 })),
    ),
  );

  let totalBase = 0;
  let totalAllowance = 0;
  let totalGrand = 0;

  const positions = orderCampaignPositions([...(schedule.position_list ?? []), ...assignments.map((item) => item.position_label || 'Vị trí chung')], schedule.position_order_mode ?? 'alphabetical');
  const positionIndex = new Map(positions.map((position, index) => [position, index]));
  const orderedAssignments = schedule.schedule_type === 'insite' ? assignments : [...assignments].sort((a, b) =>
    (positionIndex.get(a.position_label || 'Vị trí chung') ?? 0) - (positionIndex.get(b.position_label || 'Vị trí chung') ?? 0));
  orderedAssignments.forEach((item, index) => {
    const person = personnelMap.get(item.personnel_id);
    const room = item.room_id ? roomMap.get(item.room_id) : undefined;
    const positionName = room?.room_name || item.position_label || '—';
    const baseCost = Number(item.base_cost_snapshot ?? 0);
    const allowanceCost = Number(item.allowance_cost ?? 0);
    const rowTotal = baseCost + allowanceCost;

    totalBase += baseCost;
    totalAllowance += allowanceCost;
    totalGrand += rowTotal;

    xmlRows.push(
      renderRowXml(rowCursor++, 21, [
        { val: index + 1, styleId: 3, isNum: true },
        { val: positionName, styleId: 2 },
        { val: person?.personnel_code || '—', styleId: 3 },
        { val: person?.full_name || '—', styleId: 2 },
        {
          val: person ? ROLE_SHORT_LABELS[person.role_type] : '—',
          styleId: 3,
        },
        { val: person?.phone_number || '—', styleId: 3 },
        { val: SHIFT_SHORT_LABELS[item.shift_period] || item.shift_period, styleId: 3 },
        { val: baseCost, styleId: 4, isNum: true },
        { val: allowanceCost, styleId: 4, isNum: true },
        { val: rowTotal, styleId: 4, isNum: true },
        { val: item.note || '', styleId: 2 },
      ]),
    );
  });

  const provisional = getCountedProvisionalCost(schedule, getTodayInVietnam());
  if (provisional > 0) {
    xmlRows.push(renderRowXml(rowCursor++, 24, [
      { val: '', styleId: 2 }, { val: 'DỰ PHÒNG CÒN THIẾU', styleId: 2 },
      ...Array.from({ length: 7 }, () => ({ val: '', styleId: 2 })),
      { val: provisional, styleId: 4, isNum: true },
      { val: 'Chưa phân bổ cho nhân sự', styleId: 2 },
    ]));
    totalGrand += provisional;
  }

  // Summary Total Row
  xmlRows.push(
    renderRowXml(rowCursor++, 24, [
      { val: '', styleId: 5 },
      { val: 'TỔNG CỘNG CHI PHÍ', styleId: 5 },
      { val: `${assignments.length} ca`, styleId: 5 },
      { val: '', styleId: 5 },
      { val: '', styleId: 5 },
      { val: '', styleId: 5 },
      { val: '', styleId: 5 },
      { val: totalBase, styleId: 6, isNum: true },
      { val: totalAllowance, styleId: 6, isNum: true },
      { val: totalGrand, styleId: 6, isNum: true },
      { val: '', styleId: 5 },
    ]),
  );

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${colsXml}</cols>
  <sheetData>${xmlRows.join('')}</sheetData>
</worksheet>`;

  const safeCode = (
    schedule.campaign_code ||
    `${schedule.schedule_type}_${schedule.branch_code}`
  ).replace(/[^a-zA-Z0-9_-]/g, '_');

  triggerXlsxDownload(
    [{ name: 'Chi phi doan kham', xml: sheetXml }],
    `Chi-Phi-${safeCode}_${schedule.schedule_date}.xlsx`,
  );
}

/**
 * 2. Xuất Excel Tổng Hợp Chi Phí Nhân Sự Trong Tháng Theo ID
 * Gồm 2 Sheet:
 * - Sheet 1: Tổng hợp chi phí theo ID nhân viên trong tháng
 * - Sheet 2: Chi tiết từng ca trực / đoàn khám trong tháng
 */
function buildProvisionalSheet(month: string, schedules: RosterSchedule[]): string {
  const rows = [renderRowXml(1, 26, ['Ngày', 'Chi nhánh', 'Dự phòng còn thiếu (VNĐ)'].map((val) => ({ val, styleId: 1 })))];
  let total = 0;
  const today = getTodayInVietnam();
  for (const schedule of schedules.filter((item) => item.schedule_date.startsWith(month) && getCountedProvisionalCost(item, today) > 0)
    .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date) || a.branch_code.localeCompare(b.branch_code))) {
    const amount = getCountedProvisionalCost(schedule, today);
    total += amount;
    rows.push(renderRowXml(rows.length + 1, 24, [
      { val: formatDisplayDate(schedule.schedule_date), styleId: 2 },
      { val: ROSTER_BRANCH_LABELS[schedule.branch_code as 'q1' | 'q7'] ?? schedule.branch_code, styleId: 2 },
      { val: amount, styleId: 4, isNum: true },
    ]));
  }
  rows.push(renderRowXml(rows.length + 1, 24, [{ val: 'TỔNG DỰ PHÒNG', styleId: 5 }, { val: '', styleId: 5 }, { val: total, styleId: 6, isNum: true }]));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="3" width="30" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData></worksheet>`;
}

function buildActualCostSheet(month: string, schedules: RosterSchedule[], assignments: RosterAssignment[]): string {
  const today = getTodayInVietnam();
  const rows = [renderRowXml(1, 26, ['Ngày', 'Cơ sở', 'Loại lịch', 'Mã lịch / đoàn', 'Chi phí thực tế (không gồm dự phòng)'].map((val) => ({ val, styleId: 1 })))];
  let total = 0;
  for (const schedule of schedules.filter((item) => item.schedule_date.startsWith(month) && item.schedule_date < today)
    .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date))) {
    const amount = assignments.filter((item) => item.schedule_id === schedule.id).reduce((sum, item) => sum + Number(item.base_cost_snapshot ?? 0) + Number(item.allowance_cost ?? 0), 0);
    total += amount;
    rows.push(renderRowXml(rows.length + 1, 24, [
      { val: formatDisplayDate(schedule.schedule_date), styleId: 2 },
      { val: ROSTER_BRANCH_LABELS[schedule.branch_code as 'q1' | 'q7'] ?? schedule.branch_code, styleId: 2 },
      { val: SCHEDULE_TYPE_LABELS[schedule.schedule_type], styleId: 2 },
      { val: schedule.campaign_code ?? '', styleId: 2 },
      { val: amount, styleId: 4, isNum: true },
    ]));
  }
  rows.push(renderRowXml(rows.length + 1, 24, [{ val: 'THỰC TẾ ĐẾN HẾT HÔM QUA', styleId: 5 }, { val: '', styleId: 5 }, { val: '', styleId: 5 }, { val: '', styleId: 5 }, { val: total, styleId: 6, isNum: true }]));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="4" width="24" customWidth="1"/><col min="5" max="5" width="45" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData></worksheet>`;
}

export function exportMonthlyPersonnelCostExcel({
  monthStr,
  schedules,
  assignments,
  personnelList,
  roomMap,
  filterRole,
  filterPersonnelQuery,
}: {
  monthStr: string;
  schedules: RosterSchedule[];
  assignments: RosterAssignment[];
  personnelList: MedicalPersonnel[];
  roomMap: Map<string, ClinicRoom>;
  filterRole?: string;
  filterPersonnelQuery?: string;
}): void {
  const scheduleMap = new Map(schedules.map((s) => [s.id, s]));
  const personnelMap = new Map(personnelList.map((p) => [p.id, p]));

  const normalizedQuery = (filterPersonnelQuery ?? '').trim().toLowerCase();

  // Filter assignments that belong to schedules in this month
  const validAssignments = assignments.filter((a) => {
    const sched = scheduleMap.get(a.schedule_id);
    if (!sched) return false;
    const person = personnelMap.get(a.personnel_id);
    if (!person) return false;
    if (filterRole && filterRole !== 'all' && person.role_type !== filterRole) {
      return false;
    }
    if (normalizedQuery) {
      const hay = `${person.personnel_code} ${person.full_name} ${person.phone_number} ${person.email}`.toLowerCase();
      if (!hay.includes(normalizedQuery)) return false;
    }
    return true;
  });

  // Group by personnel_id
  interface SummaryItem {
    person: MedicalPersonnel;
    shiftCount: number;
    insiteCount: number;
    onsiteCount: number;
    totalBase: number;
    totalAllowance: number;
    totalGrand: number;
  }

  const summaryByPersonId = new Map<string, SummaryItem>();

  for (const item of validAssignments) {
    const person = personnelMap.get(item.personnel_id);
    const sched = scheduleMap.get(item.schedule_id);
    if (!person || !sched) continue;

    const existing = summaryByPersonId.get(person.id) ?? {
      person,
      shiftCount: 0,
      insiteCount: 0,
      onsiteCount: 0,
      totalBase: 0,
      totalAllowance: 0,
      totalGrand: 0,
    };

    const base = Number(item.base_cost_snapshot ?? 0);
    const allow = Number(item.allowance_cost ?? 0);

    existing.shiftCount += 1;
    if (sched.schedule_type === 'insite') {
      existing.insiteCount += 1;
    } else {
      existing.onsiteCount += 1;
    }
    existing.totalBase += base;
    existing.totalAllowance += allow;
    existing.totalGrand += base + allow;

    summaryByPersonId.set(person.id, existing);
  }

  const summaryList = Array.from(summaryByPersonId.values()).sort((a, b) =>
    a.person.personnel_code.localeCompare(b.person.personnel_code),
  );

  // Sheet 1: Tổng hợp theo ID
  const s1ColWidths = [6, 15, 26, 16, 15, 24, 16, 14, 14, 18, 18, 20];
  const s1ColsXml = s1ColWidths
    .map(
      (w, idx) =>
        `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`,
    )
    .join('');

  const s1Rows: string[] = [];
  let r1 = 1;
  s1Rows.push(
    renderRowXml(r1++, 26, [
      {
        val: `BẢNG TỔNG HỢP CHI PHÍ NHÂN SỰ Y TẾ THEO ID — THÁNG ${monthStr}`,
        styleId: 7,
      },
    ]),
  );
  s1Rows.push(
    renderRowXml(r1++, 20, [
      {
        val: `Nguyên tắc hạch toán: Chi phí được khóa (snapshot) tại thời điểm phân công từng phòng/đoàn khám.`,
        styleId: 8,
      },
    ]),
  );
  r1++;

  const s1Headers = [
    'STT',
    'Mã nhân sự (ID)',
    'Họ và tên',
    'Phân loại',
    'Số điện thoại',
    'Email',
    'Cost định mức (VNĐ)',
    'Tổng số ca',
    'Insite / Onsite',
    'Tổng Cost cố định (VNĐ)',
    'Tổng Phụ cấp (VNĐ)',
    'Tổng thực nhận (VNĐ)',
  ];
  s1Rows.push(
    renderRowXml(
      r1++,
      26,
      s1Headers.map((h) => ({ val: h, styleId: 1 })),
    ),
  );

  let grandShifts = 0;
  let grandBase = 0;
  let grandAllowance = 0;
  let grandTotal = 0;

  summaryList.forEach((entry, idx) => {
    grandShifts += entry.shiftCount;
    grandBase += entry.totalBase;
    grandAllowance += entry.totalAllowance;
    grandTotal += entry.totalGrand;

    s1Rows.push(
      renderRowXml(r1++, 21, [
        { val: idx + 1, styleId: 3, isNum: true },
        { val: entry.person.personnel_code, styleId: 3 },
        { val: entry.person.full_name, styleId: 2 },
        { val: ROLE_SHORT_LABELS[entry.person.role_type], styleId: 3 },
        { val: entry.person.phone_number || '—', styleId: 3 },
        { val: entry.person.email || '—', styleId: 2 },
        { val: entry.person.fixed_cost, styleId: 4, isNum: true },
        { val: entry.shiftCount, styleId: 3, isNum: true },
        { val: `${entry.insiteCount} / ${entry.onsiteCount}`, styleId: 3 },
        { val: entry.totalBase, styleId: 4, isNum: true },
        { val: entry.totalAllowance, styleId: 4, isNum: true },
        { val: entry.totalGrand, styleId: 4, isNum: true },
      ]),
    );
  });

  s1Rows.push(
    renderRowXml(r1++, 24, [
      { val: '', styleId: 5 },
      { val: 'TỔNG CỘNG TOÀN THÁNG', styleId: 5 },
      { val: `${summaryList.length} nhân sự`, styleId: 5 },
      { val: '', styleId: 5 },
      { val: '', styleId: 5 },
      { val: '', styleId: 5 },
      { val: '', styleId: 5 },
      { val: grandShifts, styleId: 5, isNum: true },
      { val: '', styleId: 5 },
      { val: grandBase, styleId: 6, isNum: true },
      { val: grandAllowance, styleId: 6, isNum: true },
      { val: grandTotal, styleId: 6, isNum: true },
    ]),
  );

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${s1ColsXml}</cols>
  <sheetData>${s1Rows.join('')}</sheetData>
</worksheet>`;

  // Sheet 2: Chi tiết từng ca làm việc
  const s2ColWidths = [6, 15, 25, 13, 14, 15, 24, 18, 28, 22, 13, 18, 18, 20, 26];
  const s2ColsXml = s2ColWidths
    .map(
      (w, idx) =>
        `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`,
    )
    .join('');

  const s2Rows: string[] = [];
  let r2 = 1;
  s2Rows.push(
    renderRowXml(r2++, 26, [
      {
        val: `CHI TIẾT CA TRỰC & ĐOÀN KHÁM THEO NHÂN SỰ — THÁNG ${monthStr}`,
        styleId: 7,
      },
    ]),
  );
  r2++;

  const s2Headers = [
    'STT',
    'Mã nhân sự (ID)',
    'Họ và tên',
    'Vai trò',
    'Ngày làm việc',
    'Chi nhánh',
    'Loại lịch',
    'Mã đoàn / Lịch',
    'Công ty / Đơn vị',
    'Phòng / Vị trí',
    'Ca trực',
    'Cost cố định (VNĐ)',
    'Phụ cấp (VNĐ)',
    'Thành tiền (VNĐ)',
    'Ghi chú',
  ];
  s2Rows.push(
    renderRowXml(
      r2++,
      26,
      s2Headers.map((h) => ({ val: h, styleId: 1 })),
    ),
  );

  const sortedDetails = [...validAssignments].sort((a, b) => {
    const pA = personnelMap.get(a.personnel_id)?.personnel_code ?? '';
    const pB = personnelMap.get(b.personnel_id)?.personnel_code ?? '';
    if (pA !== pB) return pA.localeCompare(pB);
    const sA = scheduleMap.get(a.schedule_id)?.schedule_date ?? '';
    const sB = scheduleMap.get(b.schedule_id)?.schedule_date ?? '';
    return sA.localeCompare(sB);
  });

  sortedDetails.forEach((item, idx) => {
    const person = personnelMap.get(item.personnel_id);
    const sched = scheduleMap.get(item.schedule_id);
    if (!person || !sched) return;

    const room = item.room_id ? roomMap.get(item.room_id) : undefined;
    const positionName = room?.room_name || item.position_label || '—';
    const base = Number(item.base_cost_snapshot ?? 0);
    const allow = Number(item.allowance_cost ?? 0);
    const total = base + allow;
    const branchLabel =
      ROSTER_BRANCH_LABELS[sched.branch_code as 'q1' | 'q7'] ??
      sched.branch_code.toUpperCase();

    s2Rows.push(
      renderRowXml(r2++, 21, [
        { val: idx + 1, styleId: 3, isNum: true },
        { val: person.personnel_code, styleId: 3 },
        { val: person.full_name, styleId: 2 },
        { val: ROLE_SHORT_LABELS[person.role_type], styleId: 3 },
        { val: formatDisplayDate(sched.schedule_date), styleId: 3 },
        { val: branchLabel, styleId: 3 },
        { val: SCHEDULE_TYPE_LABELS[sched.schedule_type], styleId: 2 },
        { val: sched.campaign_code || 'Insite', styleId: 3 },
        {
          val:
            sched.company_name ||
            (sched.branch_code === 'q1' ? 'DYM Quận 1 (D1)' : 'DYM Quận 7 (D7)'),
          styleId: 2,
        },
        { val: positionName, styleId: 2 },
        { val: SHIFT_SHORT_LABELS[item.shift_period] || item.shift_period, styleId: 3 },
        { val: base, styleId: 4, isNum: true },
        { val: allow, styleId: 4, isNum: true },
        { val: total, styleId: 4, isNum: true },
        { val: item.note || '', styleId: 2 },
      ]),
    );
  });

  s2Rows.push(
    renderRowXml(r2++, 24, [
      { val: '', styleId: 5 },
      { val: 'TỔNG CỘNG CHI TIẾT', styleId: 5 },
      { val: `${sortedDetails.length} ca làm việc`, styleId: 5 },
      { val: '', styleId: 5 },
      { val: '', styleId: 5 },
      { val: '', styleId: 5 },
      { val: '', styleId: 5 },
      { val: '', styleId: 5 },
      { val: '', styleId: 5 },
      { val: '', styleId: 5 },
      { val: '', styleId: 5 },
      { val: grandBase, styleId: 6, isNum: true },
      { val: grandAllowance, styleId: 6, isNum: true },
      { val: grandTotal, styleId: 6, isNum: true },
      { val: '', styleId: 5 },
    ]),
  );

  const sheet2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${s2ColsXml}</cols>
  <sheetData>${s2Rows.join('')}</sheetData>
</worksheet>`;

  triggerXlsxDownload(
    [
      { name: 'Tong hop theo ID', xml: sheet1Xml },
      { name: 'Chi tiet tung ca', xml: sheet2Xml },
      { name: 'Du phong theo ngay', xml: buildProvisionalSheet(monthStr, schedules) },
      { name: 'Thuc te da su dung', xml: buildActualCostSheet(monthStr, schedules, validAssignments) },
    ],
    `Chi-Phi-Nhan-Su-Theo-ID_${monthStr}.xlsx`,
  );
}

/**
 * 3. Xuất File Mẫu Excel Nhập Danh Mục Nhân Sự Y Tế
 */
export function exportPersonnelTemplateExcel(): void {
  const colWidths = [16, 28, 20, 26, 18, 30, 24, 32];
  const colsXml = colWidths
    .map(
      (w, idx) =>
        `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`,
    )
    .join('');

  const headers = [
    'Staff ID', 'Tên', 'CCCD', 'Số CCHN', 'SĐT', 'Email',
    'Lương / ngày (VNĐ)', 'Phân loại (BS / DD / KTV / CTV)',
  ];
  const sampleRows = [
    ['BS-001', 'Nguyễn Văn An', '001090000001', '012345/HCM-CCHN', '0901234567', 'an.nguyen@dymmedical.vn', 1500000, 'BS'],
    ['DD-001', 'Trần Thị Bình', '', '', '0902345678', 'binh.tran@dymmedical.vn', 700000, 'DD'],
    ['KTV-001', 'Lê Minh Hạo', '', '', '0903456789', 'hao.le@dymmedical.vn', 850000, 'KTV'],
    ['CTV-001', 'Phạm Hoàng Mai', '', '', '0904567890', '', 500000, 'CTV'],
  ];

  const rowsXml: string[] = [];
  let r = 1;
  rowsXml.push(
    renderRowXml(
      r++,
      26,
      headers.map((h) => ({ val: h, styleId: 1 })),
    ),
  );

  for (const row of sampleRows) {
    rowsXml.push(
      renderRowXml(
        r++,
        22,
        row.map((cell, idx) => ({
          val: cell,
          styleId: typeof cell === 'number' ? 4 : idx === 0 || idx === 7 ? 3 : 2,
          isNum: typeof cell === 'number',
        })),
      ),
    );
  }

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml.join('')}</sheetData>
</worksheet>`;

  triggerXlsxDownload(
    [{ name: 'Danh muc nhan su', xml: sheetXml }],
    'Mau-Nhap-Nhan-Su-Y-Te-DYM.xlsx',
  );
}

function columnLettersToZeroIndex(colRef: string): number {
  let index = 0;
  for (let i = 0; i < colRef.length; i++) {
    const code = colRef.toUpperCase().charCodeAt(i);
    if (code >= 65 && code <= 90) {
      index = index * 26 + (code - 64);
    }
  }
  return Math.max(0, index - 1);
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  void writer.write(compressed as unknown as BufferSource);
  void writer.close();
  const response = new Response(ds.readable);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function extractZipFiles(
  buffer: ArrayBuffer,
): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder('utf-8');

  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('File không đúng định dạng Excel (.xlsx).');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);

  for (let idx = 0; idx < totalEntries; idx++) {
    if (
      cdOffset + 46 > bytes.length ||
      view.getUint32(cdOffset, true) !== 0x02014b50
    ) {
      break;
    }
    const compressionMethod = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const fileNameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);

    const fileName = decoder.decode(
      bytes.subarray(cdOffset + 46, cdOffset + 46 + fileNameLen),
    );

    const localFileNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
    const rawSlice = bytes.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      files.set(fileName, rawSlice);
    } else if (compressionMethod === 8) {
      const inflated = await inflateRawBytes(rawSlice);
      files.set(fileName, inflated);
    }

    cdOffset += 46 + fileNameLen + extraLen + commentLen;
  }

  return files;
}

export function parseDelimitedTextToRows(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const firstLine = lines[0] ?? '';
  const delimiter = firstLine.includes('\t')
    ? '\t'
    : firstLine.includes(';') && !firstLine.includes(',')
      ? ';'
      : ',';

  return lines
    .map((line) => {
      if (delimiter === '\t') {
        return line.split('\t').map((c) => c.trim());
      }
      const cells: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === delimiter && !inQuotes) {
          cells.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      cells.push(current.trim());
      return cells;
    })
    .filter((row) => row.some((cell) => cell.length > 0));
}

export async function parseSpreadsheetFileToRows(
  file: File,
): Promise<string[][]> {
  const lowerName = file.name.toLowerCase();
  if (
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.tsv') ||
    lowerName.endsWith('.txt')
  ) {
    const text = await file.text();
    return parseDelimitedTextToRows(text);
  }

  const buffer = await file.arrayBuffer();
  const zipFiles = await extractZipFiles(buffer);
  const decoder = new TextDecoder('utf-8');
  const domParser = new DOMParser();

  // 1. Parse sharedStrings.xml if present
  const sharedStrings: string[] = [];
  const sharedBytes = zipFiles.get('xl/sharedStrings.xml');
  if (sharedBytes) {
    const sharedDoc = domParser.parseFromString(
      decoder.decode(sharedBytes),
      'application/xml',
    );
    const siNodes = Array.from(sharedDoc.getElementsByTagName('si'));
    for (const si of siNodes) {
      const tNodes = Array.from(si.getElementsByTagName('t'));
      sharedStrings.push(tNodes.map((t) => t.textContent ?? '').join(''));
    }
  }

  // 2. Find first worksheet XML
  const sheetKey =
    Array.from(zipFiles.keys()).find((k) =>
      /^xl\/worksheets\/sheet\d+\.xml$/i.test(k),
    ) ?? 'xl/worksheets/sheet1.xml';
  const sheetBytes = zipFiles.get(sheetKey);
  if (!sheetBytes) {
    throw new Error('Không tìm thấy sheet dữ liệu trong file Excel.');
  }

  const sheetDoc = domParser.parseFromString(
    decoder.decode(sheetBytes),
    'application/xml',
  );
  const rowNodes = Array.from(sheetDoc.getElementsByTagName('row'));
  const result: string[][] = [];

  for (const rowNode of rowNodes) {
    const cNodes = Array.from(rowNode.getElementsByTagName('c'));
    const rowCells: string[] = [];
    for (const cNode of cNodes) {
      const refAttr = cNode.getAttribute('r') ?? '';
      const colMatch = refAttr.match(/^[A-Za-z]+/);
      const colIdx = colMatch
        ? columnLettersToZeroIndex(colMatch[0])
        : rowCells.length;
      const cellType = cNode.getAttribute('t') ?? '';

      let cellValue = '';
      if (cellType === 'inlineStr') {
        const tNodes = Array.from(cNode.getElementsByTagName('t'));
        cellValue = tNodes.map((t) => t.textContent ?? '').join('');
      } else {
        const vNode = cNode.getElementsByTagName('v')[0];
        const rawVal = vNode?.textContent ?? '';
        if (cellType === 's') {
          const strIdx = Number.parseInt(rawVal, 10);
          cellValue = sharedStrings[strIdx] ?? rawVal;
        } else {
          cellValue = rawVal;
        }
      }

      while (rowCells.length <= colIdx) {
        rowCells.push('');
      }
      rowCells[colIdx] = cellValue.trim();
    }

    if (rowCells.some((cell) => cell.length > 0)) {
      result.push(rowCells);
    }
  }

  return result;
}

