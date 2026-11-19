import { formatAssignmentShift } from '../data/shiftTime';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDisplayDate } from '../../shared/adminFormatters';
import { formatVndCurrency, ROSTER_BRANCH_LABELS, SCHEDULE_TYPE_LABELS, type ClinicRoom } from '../data/rosterService';
import type { SettlementRow } from './settlementRows';

export function PersonnelCostSheet({ row, roomMap, month, open, onOpenChange }: {
  row: SettlementRow | null;
  roomMap: Map<string, ClinicRoom>;
  month: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="settlement-detail-sheet" side="right">
      <SheetHeader className="settlement-detail-header">
        <SheetTitle>Chi tiết chi phí nhân sự</SheetTitle>
        <SheetDescription>{row?.person.personnel_code} · {row?.person.full_name} · Tháng {month.split('-').reverse().join('/')}</SheetDescription>
      </SheetHeader>
      {row && <>
        <div className="settlement-detail-summary">
          <div><p>Tổng chi phí đang xem</p><strong>{formatVndCurrency(row.totalGrand)}</strong></div>
          <div className="flex flex-wrap gap-2"><Badge variant="secondary">{row.insiteCount} ca phòng khám</Badge><Badge variant="secondary">{row.onsiteCount} ca ngoại viện</Badge></div>
        </div>
        <div className="settlement-detail-body">
          <Table className="settlement-detail-table" aria-label="Chi tiết từng ca của nhân sự">
            <TableHeader><TableRow>
              <TableHead>Ngày làm</TableHead><TableHead>Nơi làm</TableHead><TableHead>Ca</TableHead>
              <TableHead className="text-right">Cố định</TableHead><TableHead className="text-right">Phụ cấp</TableHead><TableHead className="text-right">Tổng</TableHead>
            </TableRow></TableHeader>
            <TableBody>{row.entries.map(({ assignment, schedule }) => {
              const base = Number(assignment.base_cost_snapshot ?? 0);
              const allowance = Number(assignment.allowance_cost ?? 0);
              const room = assignment.room_id ? roomMap.get(assignment.room_id) : undefined;
              return <TableRow key={assignment.id}>
                <TableCell className="whitespace-nowrap tabular-nums">{formatDisplayDate(schedule.schedule_date)}</TableCell>
                <TableCell className="settlement-detail-place">
                  <p className="font-medium">{room?.room_name || assignment.position_label || 'Chưa đặt tên vị trí'}</p>
                  <p>{ROSTER_BRANCH_LABELS[schedule.branch_code as 'q1' | 'q7'] ?? schedule.branch_code.toUpperCase()} · {SCHEDULE_TYPE_LABELS[schedule.schedule_type]}</p>
                  {schedule.schedule_type !== 'insite' && <p>{schedule.company_name}{schedule.campaign_code ? ` · ${schedule.campaign_code}` : ''}</p>}
                  {assignment.note && <p>Ghi chú: {assignment.note}</p>}
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatAssignmentShift(assignment)}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{formatVndCurrency(base)}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{formatVndCurrency(allowance)}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums font-medium">{formatVndCurrency(base + allowance)}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </div>
        <dl className="settlement-detail-totals">
          <div><dt>Chi phí cố định</dt><dd>{formatVndCurrency(row.totalBase)}</dd></div>
          <div><dt>Phụ cấp</dt><dd>{formatVndCurrency(row.totalAllowance)}</dd></div>
          <div><dt>Tổng {row.shiftCount} ca</dt><dd>{formatVndCurrency(row.totalGrand)}</dd></div>
        </dl>
      </>}
    </SheetContent>
  </Sheet>;
}
