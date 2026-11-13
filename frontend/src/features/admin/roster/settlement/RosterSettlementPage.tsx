import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Search, X } from 'lucide-react';
import { PermissionButton as Button } from '@/features/admin/components/PermissionButton';
import { MonthPicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  formatVndCurrency,
  getProvisionalCost,
  getCountedProvisionalCost,
  ROLE_SHORT_LABELS,
  summarizeAssignmentCosts,
  type MedicalPersonnel,
  type PersonnelRoleType,
} from '../data/rosterService';
import { exportMonthlyPersonnelCostExcel } from '../shared/exportRosterExcel';
import { useRosterData } from '../data/useRosterData';
import { RosterShell } from '../shared/RosterShell';

export function RosterSettlementPage({
  authorizedIsAdmin = true,
  isActiveTab = true,
}: {
  authorizedIsAdmin?: boolean;
  isActiveTab?: boolean;
}) {
  const {
    rosterToday,
    selectedMonth,
    setSelectedMonth,
    personnelList,
    personnelMap,
    roomMap,
    schedules,
    scheduleMap,
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

  const monthlySummary = useMemo(() => {
    const map = new Map<
      string,
      {
        person: MedicalPersonnel;
        shiftCount: number;
        insiteCount: number;
        onsiteCount: number;
        totalBase: number;
        totalAllowance: number;
        totalGrand: number;
      }
    >();

    for (const a of assignments) {
      const sched = scheduleMap.get(a.schedule_id);
      const person = personnelMap.get(a.personnel_id);
      if (!sched || !person) continue;

      if (roleFilter !== 'all' && person.role_type !== roleFilter) continue;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay =
          `${person.personnel_code} ${person.full_name} ${person.phone_number} ${person.email}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }

      const cur = map.get(person.id) ?? {
        person,
        shiftCount: 0,
        insiteCount: 0,
        onsiteCount: 0,
        totalBase: 0,
        totalAllowance: 0,
        totalGrand: 0,
      };

      const base = Number(a.base_cost_snapshot ?? 0);
      const allow = Number(a.allowance_cost ?? 0);

      cur.shiftCount += 1;
      if (sched.schedule_type === 'insite') {
        cur.insiteCount += 1;
      } else {
        cur.onsiteCount += 1;
      }
      cur.totalBase += base;
      cur.totalAllowance += allow;
      cur.totalGrand += base + allow;

      map.set(person.id, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.totalGrand - a.totalGrand);
  }, [assignments, scheduleMap, personnelMap, roleFilter, searchQuery]);

  const maxPersonCost = useMemo(
    () =>
      monthlySummary.length > 0
        ? Math.max(...monthlySummary.map((r) => r.totalGrand), 1)
        : 1,
    [monthlySummary],
  );

  const monthReserve = schedules.reduce(
    (sum, schedule) => sum + getCountedProvisionalCost(schedule, rosterToday),
    0,
  );
  const monthForecast =
    summarizeAssignmentCosts(assignments).totalCost + monthReserve;
  const monthActual = summarizeAssignmentCosts(
    assignments.filter((assignment) => {
      const schedule = scheduleMap.get(assignment.schedule_id);
      return schedule && schedule.schedule_date < rosterToday;
    }),
  ).totalCost;

  return (
    <RosterShell
      activePage="roster-settlement"
      title="Quyết toán chi phí nhân sự"
      authorizedIsAdmin={authorizedIsAdmin}
      headerActions={
        <div className="flex items-center gap-2">
          <Button permissionAction="view" permissionModule="export"
            type="button"
            size="sm"
            disabled={
              assignments.length === 0 &&
              !schedules.some((schedule) => getProvisionalCost(schedule) > 0)
            }
            onClick={() =>
              exportMonthlyPersonnelCostExcel({
                monthStr: selectedMonth,
                schedules,
                assignments,
                personnelList,
                roomMap,
                filterRole: roleFilter,
                filterPersonnelQuery: searchQuery,
              })
            }
            className="h-9 gap-1.5 px-3 text-xs font-medium shadow-sm"
          >
            <ArrowDownTrayIcon className="size-3.5 shrink-0" />
            <span>Xuất Excel Tháng ({selectedMonth})</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => void reloadAll(true)}
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
      <div className="dym-roster-scope-bar">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Tháng quyết toán
          </span>
          <MonthPicker
            value={selectedMonth}
            onChange={setSelectedMonth}
            ariaLabel="Chọn tháng quyết toán"
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Chi phí dự kiến', value: monthForecast },
          { label: 'Dự phòng còn thiếu', value: monthReserve },
          { label: 'Thực tế đến hết hôm qua', value: monthActual },
        ].map((item) => (
          <section key={item.label} className="dym-roster-panel p-5">
            <h2 className="text-sm text-muted-foreground">{item.label}</h2>
            <p className="mt-3 text-2xl font-semibold tabular-nums">
              {isLoading ? '…' : formatVndCurrency(item.value)}
            </p>
          </section>
        ))}
      </div>

      {/* Monthly Personnel Cost Settlement Table by ID */}
      <section className="dym-roster-panel">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
          <div className="dym-registry-title-block">
            <h2 className="dym-registry-title">
              Bảng Quyết Toán Chi Phí Nhân Sự Theo ID — Tháng {selectedMonth}
            </h2>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
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
                  <span>Điều dưỡng (Nurse)</span>
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
                  <span>Cộng tác viên (CTV)</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Field (shadcn Input + Clear Button / Kbd) */}
              <div className="relative w-full sm:w-64 lg:w-72">
                <label htmlFor={searchInputId} className="sr-only">
                  Tìm nhân sự trong bảng quyết toán
                </label>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  ref={searchInputRef}
                  id={searchInputId}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo ID, họ tên, SĐT..."
                  className="dym-search-field h-9 bg-card pl-8 pr-8 text-xs shadow-sm"
                />
                {searchQuery ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSearchQuery('')}
                    aria-label="Xóa từ khóa tìm kiếm"
                    className="absolute right-1.5 top-1/2 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X aria-hidden="true" />
                  </Button>
                ) : (
                  <kbd
                    className="pointer-events-none absolute right-2 top-1/2 inline-flex h-5 -translate-y-1/2 select-none items-center rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground"
                    aria-hidden="true"
                  >
                    /
                  </kbd>
                )}
              </div>

              <Button permissionAction="view" permissionModule="export"
                type="button"
                variant="outline"
                size="sm"
                disabled={monthlySummary.length === 0}
                onClick={() =>
                  exportMonthlyPersonnelCostExcel({
                    monthStr: selectedMonth,
                    schedules,
                    assignments,
                    personnelList,
                    roomMap,
                    filterRole: roleFilter,
                    filterPersonnelQuery: searchQuery,
                  })
                }
                className="h-9 gap-1.5 bg-card px-3 text-xs font-medium shadow-sm"
              >
                <ArrowDownTrayIcon className="size-3.5 shrink-0" />
                <span>Xuất Excel theo ID</span>
              </Button>
            </div>
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
                  <th>Số điện thoại</th>
                  <th className="is-right">Cost định mức</th>
                  <th className="is-center">Số ca</th>
                  <th className="is-center">Insite / Onsite</th>
                  <th className="is-right">Tổng Cost cố định</th>
                  <th className="is-right">Tổng Phụ cấp</th>
                  <th className="is-right">Tổng thực nhận</th>
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
                    <td>
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="is-right">
                      <Skeleton className="ml-auto h-4 w-20" />
                    </td>
                    <td className="is-center">
                      <Skeleton className="mx-auto h-4 w-8" />
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
          <div className="dym-roster-empty-slot">
            <span>
              <strong>
                Chưa có phát sinh ca trực hoặc đoàn khám trong tháng{' '}
                {selectedMonth}.
              </strong>{' '}
              Khi bạn gán nhân sự ở trang Lịch tại Phòng khám hoặc Đoàn khám
              Onsite, chi phí sẽ tự động tổng hợp tại đây.
            </span>
          </div>
        ) : (
          <div className="dym-roster-table-wrap">
            <table className="dym-roster-table">
              <thead>
                <tr>
                  <th>Mã ID</th>
                  <th>Họ và tên nhân sự</th>
                  <th className="is-center">Vai trò</th>
                  <th>Số điện thoại</th>
                  <th className="is-right">Cost định mức</th>
                  <th className="is-center">Số ca</th>
                  <th className="is-center">Insite / Onsite</th>
                  <th className="is-right">Tổng Cost cố định</th>
                  <th className="is-right">Tổng Phụ cấp</th>
                  <th className="is-right">Tổng thực nhận</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.map((row, idx) => {
                  const pct = Math.min(
                    100,
                    Math.max(
                      4,
                      Math.round((row.totalGrand / maxPersonCost) * 100),
                    ),
                  );
                  return (
                    <tr key={row.person.id}>
                      <td>
                        <span className="dym-roster-code-badge">
                          {row.person.personnel_code}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {row.person.full_name}
                          </span>
                          <div
                            className="dym-roster-thin-bar-track"
                            aria-hidden="true"
                          >
                            <div
                              className={`dym-roster-thin-bar-fill ${idx === 0 ? 'is-top' : ''}`}
                              style={{ transform: `scaleX(${pct / 100})` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="is-center">
                        <span
                          className={`dym-roster-role-badge role-${row.person.role_type}`}
                        >
                          {ROLE_SHORT_LABELS[row.person.role_type]}
                        </span>
                      </td>
                      <td className="dym-roster-tabular">
                        {row.person.phone_number || '—'}
                      </td>
                      <td className="is-right dym-roster-tabular text-slate-500">
                        {formatVndCurrency(row.person.fixed_cost)}
                      </td>
                      <td className="is-center dym-roster-tabular font-semibold">
                        {row.shiftCount}
                      </td>
                      <td className="is-center dym-roster-tabular text-xs">
                        {row.insiteCount} phòng / {row.onsiteCount} đoàn
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
                  <td colSpan={5}>
                    Tổng quyết toán ({monthlySummary.length} nhân sự)
                  </td>
                  <td className="is-center dym-roster-tabular">
                    {monthlySummary.reduce((s, r) => s + r.shiftCount, 0)}
                  </td>
                  <td />
                  <td className="is-right dym-roster-tabular">
                    {formatVndCurrency(
                      monthlySummary.reduce((s, r) => s + r.totalBase, 0),
                    )}
                  </td>
                  <td className="is-right dym-roster-tabular">
                    {formatVndCurrency(
                      monthlySummary.reduce((s, r) => s + r.totalAllowance, 0),
                    )}
                  </td>
                  <td className="is-right dym-roster-tabular">
                    {formatVndCurrency(
                      monthlySummary.reduce((s, r) => s + r.totalGrand, 0),
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </RosterShell>
  );
}

export default RosterSettlementPage;
