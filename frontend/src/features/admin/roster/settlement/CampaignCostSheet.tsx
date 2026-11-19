import { formatAssignmentShift } from '../data/shiftTime';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { formatDisplayDate } from '../../shared/adminFormatters';
import { formatVndCurrency, ROSTER_BRANCH_LABELS, SCHEDULE_TYPE_LABELS, type MedicalPersonnel } from '../data/rosterService';
import type { CampaignSettlementRow } from './campaignSettlementRows';

export function CampaignCostSheet({ row, personnelMap, open, onOpenChange }: {
  row: CampaignSettlementRow | null;
  personnelMap: Map<string, MedicalPersonnel>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const schedule = row?.schedule;
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="settlement-detail-sheet settlement-campaign-detail" side="right">
      <SheetHeader className="settlement-detail-header">
        <SheetTitle>Chi tiết chi phí đoàn</SheetTitle>
        <SheetDescription>{schedule && <>{schedule.campaign_code || 'Chưa cấp mã đoàn'} · {schedule.company_name || 'Chưa có tên công ty'}<br />
          {formatDisplayDate(schedule.schedule_date)} · {ROSTER_BRANCH_LABELS[schedule.branch_code as 'q1' | 'q7'] ?? schedule.branch_code.toUpperCase()}</>}</SheetDescription>
      </SheetHeader>
      {row && schedule && <>
        <div className="settlement-detail-summary">
          <div><p>Chi phí nhân sự</p><strong>{formatVndCurrency(row.totalCost)}</strong></div>
          <div className="flex flex-wrap items-center gap-2" data-type={schedule.schedule_type}>
            <Badge variant="secondary" className="settlement-campaign-type">{SCHEDULE_TYPE_LABELS[schedule.schedule_type]}</Badge>
            <span className="text-sm text-muted-foreground">{row.entries.length} ca · {row.personnelCount} người</span>
          </div>
        </div>
        <div className="settlement-detail-body">
          {row.entries.length === 0 ? <Empty className="settlement-empty"><EmptyHeader>
            <EmptyTitle>Chưa có nhân sự được phân công</EmptyTitle>
            <EmptyDescription>Chi phí nhân sự của lịch đoàn này hiện là 0 ₫</EmptyDescription>
          </EmptyHeader></Empty> : <Table className="settlement-detail-table" aria-label="Chi tiết phân công và chi phí đoàn">
            <TableHeader><TableRow>
              <TableHead>Vị trí</TableHead><TableHead>Nhân sự</TableHead><TableHead>Ca</TableHead>
              <TableHead className="text-right">Cố định</TableHead><TableHead className="text-right">Phụ cấp</TableHead><TableHead className="text-right">Tổng</TableHead>
            </TableRow></TableHeader>
            <TableBody>{row.entries.map(assignment => {
              const person = personnelMap.get(assignment.personnel_id);
              const base = Number(assignment.base_cost_snapshot ?? 0);
              const allowance = Number(assignment.allowance_cost ?? 0);
              return <TableRow key={assignment.id}>
                <TableCell className="settlement-detail-place"><p>{assignment.position_label || 'Chưa đặt tên vị trí'}</p>{assignment.note && <p>Ghi chú: {assignment.note}</p>}</TableCell>
                <TableCell className="settlement-detail-place"><p>{person?.full_name || 'Nhân sự không còn trong danh mục'}</p><p>{person?.personnel_code || assignment.personnel_id}</p></TableCell>
                <TableCell className="whitespace-nowrap">{formatAssignmentShift(assignment)}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{formatVndCurrency(base)}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{formatVndCurrency(allowance)}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums font-medium">{formatVndCurrency(base + allowance)}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>}
        </div>
        <dl className="settlement-detail-totals">
          <div><dt>Chi phí cố định</dt><dd>{formatVndCurrency(row.baseCost)}</dd></div>
          <div><dt>Phụ cấp</dt><dd>{formatVndCurrency(row.allowanceCost)}</dd></div>
          <div><dt>Chi phí nhân sự</dt><dd>{formatVndCurrency(row.totalCost)}</dd></div>
          <div><dt>Dự phòng còn thiếu</dt><dd>{formatVndCurrency(row.reserve)}</dd></div>
        </dl>
      </>}
    </SheetContent>
  </Sheet>;
}
