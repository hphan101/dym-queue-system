import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { PermissionButton as Button } from '../../shared/PermissionButton';
import { MonthPicker } from '@/components/ui/date-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchField } from '@/components/search-field';
import { NumberedPagination } from '@/components/numbered-pagination';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDisplayDate } from '../../shared/adminFormatters';
import { fetchRosterBundleForMonth, formatVndCurrency, ROSTER_BRANCH_LABELS, type RosterSchedule, type RosterAssignment, type MedicalPersonnel } from '../data/rosterService';
import { exportCampaignSettlementExcel } from '../shared/exportRosterExcel';
import { buildCampaignSettlementRows, type CampaignCostType, type CampaignSettlementRow } from './campaignSettlementRows';
import { CampaignCostSheet } from './CampaignCostSheet';
import '../shared/campaignColors.css';

const types = [
  { value: 'all', label: 'Tất cả' },
  { value: 'blood_draw', label: 'Blood sampling' },
  { value: 'onsite_exam', label: 'Onsite HC' },
  { value: 'setup', label: 'Onsite set-up' },
] as const;
const emptySchedules: RosterSchedule[] = [];
const emptyAssignments: RosterAssignment[] = [];

export function CampaignCostTable({ schedules, assignments, personnelList, month, today, isLoading, isActiveTab = true }: {
  schedules: RosterSchedule[]; assignments: RosterAssignment[]; personnelList: MedicalPersonnel[]; month: string; today: string; isLoading: boolean; isActiveTab?: boolean;
}) {
  const [campaignMonth, setCampaignMonth] = useState(month);
  const separateMonth = campaignMonth !== month;
  const bundle = useQuery({
    queryKey: ['roster', 'settlement-campaign', campaignMonth],
    queryFn: () => fetchRosterBundleForMonth(campaignMonth),
    enabled: separateMonth,
  });
  const loading = separateMonth ? bundle.isPending || bundle.isFetching : isLoading;
  const error = separateMonth ? bundle.error : null;
  const monthSchedules = separateMonth ? bundle.data?.schedules ?? emptySchedules : schedules;
  const monthAssignments = separateMonth ? bundle.data?.assignments ?? emptyAssignments : assignments;
  const [type, setType] = useState<CampaignCostType>('all');
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({ key: '', page: 1 });
  const [exportOpen, setExportOpen] = useState(false);
  const [detail, setDetail] = useState<CampaignSettlementRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const personnelMap = useMemo(() => new Map(personnelList.map(person => [person.id, person])), [personnelList]);
  const rows = useMemo(() => buildCampaignSettlementRows(monthSchedules, monthAssignments, campaignMonth, today), [monthSchedules, monthAssignments, campaignMonth, today]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('vi');
    return rows.filter(({ schedule }) => (type === 'all' || schedule.schedule_type === type)
      && (!keyword || `${schedule.campaign_code ?? ''} ${schedule.company_name ?? ''}`.toLocaleLowerCase('vi').includes(keyword)));
  }, [rows, query, type]);
  const key = JSON.stringify([campaignMonth, type, query, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = pagination.key === key ? Math.min(pagination.page, totalPages) : 1;
  const start = (page - 1) * pageSize;
  const totals = filtered.reduce((sum, row) => ({ base: sum.base + row.baseCost, allowance: sum.allowance + row.allowanceCost, total: sum.total + row.totalCost, reserve: sum.reserve + row.reserve }), { base: 0, allowance: 0, total: 0, reserve: 0 });
  const exportExcel = (filteredOnly: boolean) => {
    setExportOpen(false);
    exportCampaignSettlementExcel(campaignMonth, filteredOnly ? filtered : rows, filteredOnly ? 'filtered' : 'month');
  };

  return <Card className="settlement-panel settlement-campaign-panel">
    <CardHeader className="settlement-panel-header">
      <div className="settlement-panel-heading">
        <div className="dym-registry-title-block">
        <CardTitle className="dym-registry-title">Chi phí theo đoàn</CardTitle>
        <CardDescription>{filtered.length} lịch đoàn trong tháng · Dự phòng hiển thị riêng với chi phí nhân sự</CardDescription>
        </div>
        <div className="settlement-table-actions">
          <MonthPicker value={campaignMonth} onChange={value => { setDetailOpen(false); setCampaignMonth(value); setPagination({ key: '', page: 1 }); }} ariaLabel="Chọn tháng chi phí đoàn" />
          <Popover open={exportOpen} onOpenChange={setExportOpen}>
            <PopoverTrigger asChild>
              <Button type="button" permissionAction="view" permissionModule="export" disabled={loading || Boolean(error) || rows.length === 0}>
                <ArrowDownTrayIcon aria-hidden="true" />Xuất Excel<ChevronDown aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2" aria-label="Chọn phạm vi xuất Excel đoàn">
              <div className="flex flex-col gap-1">
                <Button type="button" variant="ghost" className="justify-start" permissionAction="view" permissionModule="export" onClick={() => exportExcel(false)}>Xuất toàn tháng ({rows.length} lịch đoàn)</Button>
                <Button type="button" variant="ghost" className="justify-start" permissionAction="view" permissionModule="export" disabled={filtered.length === 0} onClick={() => exportExcel(true)}>Xuất bảng đang lọc ({filtered.length} lịch đoàn)</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="settlement-table-toolbar">
        <Tabs value={type} onValueChange={value => { setType(value as CampaignCostType); setPagination({ key: '', page: 1 }); }}>
          <TabsList aria-label="Lọc chi phí theo loại đoàn">
            {types.map(item => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <SearchField value={query} onChange={event => { setQuery(event.target.value); setPagination({ key: '', page: 1 }); }} onClear={() => { setQuery(''); setPagination({ key: '', page: 1 }); }}
          placeholder="Tìm mã đoàn, công ty..." aria-label="Tìm đoàn trong bảng chi phí" />
      </div>
    </CardHeader>
    <CardContent className="p-0">
      {error ? <Alert variant="destructive" className="m-6 w-auto"><AlertDescription>
        Không thể tải chi phí đoàn. <Button type="button" variant="outline" onClick={() => void bundle.refetch()}>Thử lại</Button>
      </AlertDescription></Alert> : loading ? <div role="status" aria-busy="true" className="flex flex-col gap-4 p-6">
        <span className="sr-only">Đang tải chi phí đoàn</span>
        {[0, 1, 2].map(index => <Skeleton key={index} className="h-10 w-full" />)}
      </div> : filtered.length === 0 ? <Empty className="settlement-empty"><EmptyHeader>
        <EmptyTitle>{query.trim() || type !== 'all' ? 'Không có đoàn phù hợp' : 'Chưa có lịch đoàn trong tháng'}</EmptyTitle>
        <EmptyDescription>{query.trim() || type !== 'all' ? 'Thử từ khóa khác hoặc chọn Tất cả' : 'Các lịch lấy máu, Onsite và Setup sẽ xuất hiện tại đây'}</EmptyDescription>
      </EmptyHeader></Empty> : <div className="settlement-campaign-table">
        <Table className="dym-roster-table" aria-label="Chi phí theo đoàn">
          <TableHeader><TableRow>
            <TableHead>Mã đoàn</TableHead><TableHead>Công ty</TableHead><TableHead>Ngày</TableHead><TableHead>Loại đoàn</TableHead><TableHead>Chi nhánh</TableHead>
            <TableHead className="is-right">Chi phí cố định</TableHead>
            <TableHead className="is-right">Phụ cấp</TableHead><TableHead className="is-right">Chi phí nhân sự</TableHead><TableHead className="is-right">Dự phòng</TableHead>
          </TableRow></TableHeader>
          <TableBody>{filtered.slice(start, start + pageSize).map(row => <TableRow key={row.schedule.id}>
            <TableCell className="whitespace-nowrap tabular-nums"><button type="button" className="settlement-person-link"
              aria-label={`Xem chi phí đoàn ${row.schedule.campaign_code || row.schedule.company_name || formatDisplayDate(row.schedule.schedule_date)}`}
              onClick={() => { setDetail(row); setDetailOpen(true); }}>{row.schedule.campaign_code || 'Chưa cấp mã đoàn'}</button></TableCell>
            <TableCell className="font-medium">{row.schedule.company_name || 'Chưa có tên công ty'}</TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">{formatDisplayDate(row.schedule.schedule_date)}</TableCell>
            <TableCell data-type={row.schedule.schedule_type}><Badge variant="secondary" className="settlement-campaign-type">{types.find(item => item.value === row.schedule.schedule_type)?.label}</Badge></TableCell>
            <TableCell className="whitespace-nowrap">{ROSTER_BRANCH_LABELS[row.schedule.branch_code as 'q1' | 'q7'] ?? row.schedule.branch_code.toUpperCase()}</TableCell>
            <TableCell className="is-right tabular-nums">{formatVndCurrency(row.baseCost)}</TableCell>
            <TableCell className="is-right tabular-nums">{formatVndCurrency(row.allowanceCost)}</TableCell>
            <TableCell className="is-right tabular-nums font-medium">{formatVndCurrency(row.totalCost)}</TableCell>
            <TableCell className="is-right tabular-nums text-muted-foreground">{formatVndCurrency(row.reserve)}</TableCell>
          </TableRow>)}</TableBody>
          <TableFooter><TableRow>
            <TableCell colSpan={5}>Tổng ({filtered.length} lịch đoàn)</TableCell>
            <TableCell className="is-right tabular-nums">{formatVndCurrency(totals.base)}</TableCell>
            <TableCell className="is-right tabular-nums">{formatVndCurrency(totals.allowance)}</TableCell>
            <TableCell className="is-right tabular-nums">{formatVndCurrency(totals.total)}</TableCell>
            <TableCell className="is-right tabular-nums">{formatVndCurrency(totals.reserve)}</TableCell>
          </TableRow></TableFooter>
        </Table>
      </div>}
    </CardContent>
    {!loading && !error && filtered.length > 0 && <div className="settlement-pagination">
      <p>Hiển thị {start + 1}–{Math.min(start + pageSize, filtered.length)} trong {filtered.length} lịch đoàn</p>
      <NumberedPagination currentPage={page} totalPages={totalPages} onPageChange={page => setPagination({ key, page })}
        pageSize={pageSize} onPageSizeChange={value => { setPageSize(value); setPagination({ key: '', page: 1 }); }} label="Phân trang chi phí đoàn" />
    </div>}
    <CampaignCostSheet row={detail} personnelMap={personnelMap} open={detailOpen && isActiveTab && detail?.schedule.schedule_date.slice(0, 7) === campaignMonth} onOpenChange={setDetailOpen} />
  </Card>;
}
