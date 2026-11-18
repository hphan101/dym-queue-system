import { SearchField } from '@/components/search-field';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from 'lucide-react';
import { PermissionButton as Button } from '@/features/admin/shared/PermissionButton';
import { MonthPicker } from '@/components/ui/date-picker';

import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { NumberedPagination } from '@/components/numbered-pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { BranchCode } from '@/types/domain';
import {
  formatVndCurrency,
  ROSTER_BRANCH_LABELS,
  ROLE_SHORT_LABELS,
  type PersonnelRoleType,
} from '../data/rosterService';
import { exportMonthlyPersonnelCostExcel } from '../shared/exportRosterExcel';
import { useRosterData } from '../data/useRosterData';
import { RosterShell } from '../shared/RosterShell';
import { buildSettlementMetrics } from './settlementMetrics';
import { SettlementMetricCards } from './SettlementMetricCards';
import { buildSettlementRows, type SettlementLocation, type SettlementRow, type SettlementSort } from './settlementRows';
import { PersonnelCostSheet } from './PersonnelCostSheet';
import { CampaignCostTable } from './CampaignCostTable';
import './settlement.css';

export function RosterSettlementPage({
  authorizedIsAdmin = true,
  isActiveTab = true,
}: {
  authorizedIsAdmin?: boolean;
  isActiveTab?: boolean;
}) {
  const queryClient = useQueryClient();
  const {
    rosterToday,
    selectedMonth,
    setSelectedMonth,
    personnelList,
    roomMap,
    schedules,
    assignments,
    isLoading,
    reloadAll,
  } = useRosterData();

  const searchInputId = useId();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | PersonnelRoleType>(
    'all',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState<'all' | BranchCode>('all');
  const [locationFilter, setLocationFilter] = useState<SettlementLocation>('all');
  const [sortBy, setSortBy] = useState<SettlementSort>('totalGrand');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({ key: '', page: 1 });
  const [exportOpen, setExportOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<SettlementRow | null>(null);
  const [detailMonth, setDetailMonth] = useState(selectedMonth);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (!isActiveTab) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (event.key === '/' && !isEditable) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActiveTab]);

  const monthlySummary = useMemo(() => buildSettlementRows(schedules, assignments, personnelList, {
    month: selectedMonth, role: roleFilter, query: searchQuery, branch: branchFilter,
    location: locationFilter, sortBy, sortDirection,
  }), [schedules, assignments, personnelList, selectedMonth, roleFilter, searchQuery, branchFilter, locationFilter, sortBy, sortDirection]);
  const allMonthRows = useMemo(() => buildSettlementRows(schedules, assignments, personnelList, { month: selectedMonth }), [schedules, assignments, personnelList, selectedMonth]);
  const pageKey = JSON.stringify([selectedMonth, roleFilter, searchQuery, branchFilter, locationFilter, sortBy, sortDirection, pageSize]);
  const totalPages = Math.max(1, Math.ceil(monthlySummary.length / pageSize));
  const visiblePage = pagination.key === pageKey ? Math.min(pagination.page, totalPages) : 1;
  const pageStart = (visiblePage - 1) * pageSize;
  const visibleRows = monthlySummary.slice(pageStart, pageStart + pageSize);
  const hasFilters = Boolean(searchQuery.trim() || roleFilter !== 'all' || branchFilter !== 'all' || locationFilter !== 'all');
  const totals = monthlySummary.reduce((total, row) => ({
    base: total.base + row.totalBase,
    allowance: total.allowance + row.totalAllowance, grand: total.grand + row.totalGrand,
  }), { base: 0, allowance: 0, grand: 0 });
  const exportExcel = (filtered: boolean) => {
    setExportOpen(false);
    exportMonthlyPersonnelCostExcel({
      monthStr: selectedMonth, schedules, assignments, personnelList, roomMap,
      scope: filtered ? 'filtered' : 'month',
      ...(filtered ? { filterRole: roleFilter, filterPersonnelQuery: searchQuery, filterBranch: branchFilter, filterLocation: locationFilter, sortBy, sortDirection } : {}),
    });
  };
  const sortColumn = (column: SettlementSort, label: string) => (
    <button type="button" className="settlement-sort-button" onClick={() => {
      setSortBy(column);
      setSortDirection(sortBy === column ? (sortDirection === 'asc' ? 'desc' : 'asc') : column === 'name' ? 'asc' : 'desc');
    }} aria-label={`Sắp xếp theo ${label.toLowerCase()}`}>
      {label}{sortBy !== column ? <ArrowUpDown aria-hidden="true" /> : sortDirection === 'asc' ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
    </button>
  );

  const metrics = useMemo(
    () => buildSettlementMetrics(schedules, assignments, selectedMonth, rosterToday),
    [schedules, assignments, selectedMonth, rosterToday],
  );
  const [year, month] = selectedMonth.split('-');

  return (
    <RosterShell
      activePage="roster-settlement"
      title="Quyết toán chi phí nhân sự"
      contentClassName={`dym-settlement-content${isActiveTab ? ' settlement-page-enter' : ''}`}
      authorizedIsAdmin={authorizedIsAdmin}
      headerActions={
        <div className="settlement-header-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => { void reloadAll(true); void queryClient.invalidateQueries({ queryKey: ['roster', 'settlement-campaign'] }); }}
            className="h-9 gap-1.5 bg-card px-3 text-xs font-medium shadow-sm"
          >
            <ArrowPathIcon
              className={`size-3.5 shrink-0 ${isLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{isLoading ? 'Đang tải...' : 'Làm mới'}</span>
          </Button>
        </div>
      }
    >
      <div className="settlement-month-context">
        <h2>Tháng {Number(month)}/{year}</h2>
        <p>Chi phí tại phòng khám và đoàn khám ngoại viện</p>
      </div>
      <SettlementMetricCards data={metrics} month={selectedMonth} isLoading={isLoading} isActiveTab={isActiveTab} />

      {/* Monthly Personnel Cost Settlement Table by ID */}
      <Card className="settlement-panel">
        <div className="settlement-panel-header">
          <div className="settlement-panel-heading">
          <div className="dym-registry-title-block">
            <h2 className="dym-registry-title">
              Chi phí theo nhân sự
            </h2>
            <p className="text-sm text-muted-foreground">{monthlySummary.length} nhân sự trong bảng · Bộ lọc bên dưới chỉ áp dụng cho bảng này</p>
          </div>
            <div className="settlement-table-actions">
          <MonthPicker value={selectedMonth} onChange={setSelectedMonth} ariaLabel="Chọn tháng quyết toán" />
          <Popover open={exportOpen} onOpenChange={setExportOpen}>
            <PopoverTrigger asChild>
              <Button permissionAction="view" permissionModule="export" type="button" disabled={isLoading || (allMonthRows.length === 0 && metrics.totals.reserve === 0)}>
                <ArrowDownTrayIcon aria-hidden="true" />Xuất Excel<ChevronDown aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2" aria-label="Chọn phạm vi xuất Excel">
              <div className="flex flex-col gap-1">
                <Button permissionAction="view" permissionModule="export" type="button" variant="ghost" className="justify-start" onClick={() => exportExcel(false)}>Xuất toàn tháng ({allMonthRows.length} nhân sự)</Button>
                <Button permissionAction="view" permissionModule="export" type="button" variant="ghost" className="justify-start" disabled={monthlySummary.length === 0} onClick={() => exportExcel(true)}>Xuất bảng đang lọc ({monthlySummary.length} nhân sự)</Button>
              </div>
            </PopoverContent>
          </Popover>
            </div>
          </div>

          <div className="settlement-table-toolbar">
            {/* Role Filter Tabs (shadcn Tabs) */}
            <Tabs
              value={roleFilter}
              onValueChange={(value) =>
                setRoleFilter(value as 'all' | PersonnelRoleType)
              }
            >
              <TabsList
                aria-label="Lọc theo vai trò"
                className="h-9 bg-muted p-1"
              >
                <TabsTrigger
                  value="all"
                  className="h-7 gap-1.5 px-3 text-xs font-medium"
                >
                  <span>Tất cả vai trò</span>
                </TabsTrigger>
                <TabsTrigger
                  value="doctor"
                  className="h-7 gap-1.5 px-3 text-xs font-medium"
                >
                  <span
                    className="size-1.5 rounded-full bg-sky-500"
                    aria-hidden="true"
                  />
                  <span>Bác sĩ</span>
                </TabsTrigger>
                <TabsTrigger
                  value="nurse"
                  className="h-7 gap-1.5 px-3 text-xs font-medium"
                >
                  <span
                    className="size-1.5 rounded-full bg-emerald-500"
                    aria-hidden="true"
                  />
                  <span>Điều dưỡng</span>
                </TabsTrigger>
                <TabsTrigger
                  value="technician"
                  className="h-7 gap-1.5 px-3 text-xs font-medium"
                >
                  <span
                    className="size-1.5 rounded-full bg-slate-500"
                    aria-hidden="true"
                  />
                  <span>KTV / Khác</span>
                </TabsTrigger>
                <TabsTrigger
                  value="ctv"
                  className="h-7 gap-1.5 px-3 text-xs font-medium"
                >
                  <span
                    className="size-1.5 rounded-full bg-amber-500"
                    aria-hidden="true"
                  />
                  <span>Cộng tác viên</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Field (shadcn Input + Clear Button / Kbd) */}
              <SearchField
                ref={searchInputRef}
                id={searchInputId}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo ID, họ tên, SĐT..."
                aria-label="Tìm nhân sự trong bảng quyết toán"
                onClear={() => setSearchQuery('')}
                shortcut
              />

            </div>
          </div>
          <div className="settlement-filter-row">
            <Select value={locationFilter} onValueChange={value => setLocationFilter(value as SettlementLocation)}>
              <SelectTrigger aria-label="Nơi làm việc" className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="all">Nơi làm việc</SelectItem><SelectItem value="insite">Phòng khám</SelectItem><SelectItem value="onsite">Ngoại viện</SelectItem></SelectGroup></SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={value => setBranchFilter(value as 'all' | BranchCode)}>
              <SelectTrigger aria-label="Chi nhánh" className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="all">Chi nhánh</SelectItem>
                {Array.from(new Set([...Object.keys(ROSTER_BRANCH_LABELS), ...schedules.map(schedule => schedule.branch_code)])).sort().map(branch => <SelectItem key={branch} value={branch}>{ROSTER_BRANCH_LABELS[branch as 'q1' | 'q7'] ?? branch.toUpperCase()}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
            {hasFilters && <Button type="button" variant="ghost" onClick={() => { setRoleFilter('all'); setSearchQuery(''); setLocationFilter('all'); setBranchFilter('all'); }}>Xóa bộ lọc</Button>}
          </div>
        </div>

        {isLoading ? (
          <div
            className="dym-roster-table-wrap"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <span className="sr-only">Đang tải bảng quyết toán chi phí...</span>
            <table className="dym-roster-table" aria-hidden="true">
              <thead>
                <tr>
                  <th>Mã ID</th>
                  <th>Họ và tên nhân sự</th>
                  <th className="is-center">Vai trò</th>
                  <th className="is-right">Định mức / ngày</th>
                  <th className="is-center">Ca theo nơi làm</th>
                  <th className="is-right">Chi phí cố định</th>
                  <th className="is-right">Phụ cấp</th>
                  <th className="is-right">Tổng chi phí</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4].map((index) => (
                  <tr key={index}>
                    <td>
                      <Skeleton className="h-5 w-16 rounded-md" />
                    </td>
                    <td>
                      <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-1.5 w-28 rounded-full" />
                      </div>
                    </td>
                    <td className="is-center">
                      <Skeleton className="mx-auto h-5 w-16 rounded-full" />
                    </td>
                    <td className="is-right">
                      <Skeleton className="ml-auto h-4 w-20" />
                    </td>
                    <td className="is-center">
                      <Skeleton className="mx-auto h-4 w-16" />
                    </td>
                    <td className="is-right">
                      <Skeleton className="ml-auto h-4 w-24" />
                    </td>
                    <td className="is-right">
                      <Skeleton className="ml-auto h-4 w-20" />
                    </td>
                    <td className="is-right">
                      <Skeleton className="ml-auto h-4 w-24" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : monthlySummary.length === 0 ? (
          <Empty className="settlement-empty">
            <EmptyHeader>
              <EmptyTitle>{hasFilters ? 'Không có nhân sự phù hợp' : 'Chưa có chi phí phân công'}</EmptyTitle>
              <EmptyDescription>{hasFilters
                ? 'Thử từ khóa khác hoặc chọn tất cả vai trò'
                : 'Chi phí sẽ được tổng hợp khi có nhân sự được phân công trong tháng này'}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="dym-roster-table-wrap settlement-table-scroll">
            <table className="dym-roster-table" aria-label="Chi phí theo nhân sự">
              <thead>
                <tr>
                  <th>Mã ID</th>
                  <th aria-sort={sortBy === 'name' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortColumn('name', 'Họ và tên nhân sự')}</th>
                  <th className="is-center">Vai trò</th>
                  <th className="is-right">Định mức / ngày</th>
                  <th className="is-center">Ca theo nơi làm</th>
                  <th className="is-right">Chi phí cố định</th>
                  <th className="is-right">Phụ cấp</th>
                  <th className="is-right" aria-sort={sortBy === 'totalGrand' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortColumn('totalGrand', 'Tổng chi phí')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  return (
                    <tr key={row.person.id}>
                      <td>
                        <span className="dym-roster-code-badge">
                          {row.person.personnel_code}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-col">
                          <button type="button" className="settlement-person-link" aria-label={`Xem chi phí của ${row.person.full_name}`} onClick={() => { setDetailRow(row); setDetailMonth(selectedMonth); setDetailOpen(true); }}>
                            {row.person.full_name}
                          </button>
                        </div>
                      </td>
                      <td className="is-center">
                        <Badge variant="secondary">
                          {row.person.role_type === 'nurse' ? 'Điều dưỡng' : ROLE_SHORT_LABELS[row.person.role_type]}
                        </Badge>
                      </td>
                      <td className="is-right dym-roster-tabular text-muted-foreground">
                        {formatVndCurrency(row.person.fixed_cost)}
                      </td>
                      <td className="is-center dym-roster-tabular text-xs">
                        <div className="flex flex-col gap-1"><span>{row.insiteCount} ca phòng khám</span><span>{row.onsiteCount} ca ngoại viện</span></div>
                      </td>
                      <td className="is-right dym-roster-tabular">
                        {formatVndCurrency(row.totalBase)}
                      </td>
                      <td className="is-right dym-roster-tabular">
                        {formatVndCurrency(row.totalAllowance)}
                      </td>
                      <td className="is-right dym-roster-tabular font-semibold">
                        {formatVndCurrency(row.totalGrand)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>
                    Tổng quyết toán ({monthlySummary.length} nhân sự)
                  </td>
                  <td />
                  <td className="is-right dym-roster-tabular">
                    {formatVndCurrency(totals.base)}
                  </td>
                  <td className="is-right dym-roster-tabular">
                    {formatVndCurrency(totals.allowance)}
                  </td>
                  <td className="is-right dym-roster-tabular">
                    {formatVndCurrency(totals.grand)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {!isLoading && monthlySummary.length > 0 && <div className="settlement-pagination">
          <p>Hiển thị {pageStart + 1}–{Math.min(pageStart + pageSize, monthlySummary.length)} trong {monthlySummary.length} nhân sự</p>
          <NumberedPagination currentPage={visiblePage} totalPages={totalPages} onPageChange={page => setPagination({ key: pageKey, page })} pageSize={pageSize} onPageSizeChange={setPageSize} label="Phân trang quyết toán" />
        </div>}
      </Card>
      <CampaignCostTable schedules={schedules} assignments={assignments} personnelList={personnelList} month={selectedMonth} today={rosterToday} isLoading={isLoading} isActiveTab={isActiveTab} />
      <PersonnelCostSheet row={detailRow} roomMap={roomMap} month={detailMonth} open={detailOpen && detailMonth === selectedMonth && isActiveTab} onOpenChange={setDetailOpen} />
    </RosterShell>
  );
}

export default RosterSettlementPage;
