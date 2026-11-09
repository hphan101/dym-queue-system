import { AdminLayout } from './components/AdminLayout';
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import {
  Building2,
  Check,
  ChevronsUpDown,
  Printer,
  Search,
  X,
} from 'lucide-react';

import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { type TT25RegistrationData } from '../registration/tt25Types';
import { buildPrintData } from './utils/buildPrintData';

const TT25PrintModal = lazy(() => import('../registration/TT25PrintModal'));
const ConsentPrintModal = lazy(
  () => import('../registration/ConsentPrintModal'),
);

import { BRANCH_NAMES } from '../../config/branches';
import { formatQueueNumber } from '../../lib/queueNumber';
import { supabase } from '../../lib/supabaseClient';
import type { BranchCode } from '../../types/domain';

import {
  REALTIME_REGISTRATION_COLUMNS,
  type RealtimeConnectionState,
} from './constants/queueConstants';

import './admin.css';
import './registrations.css';

import { useStaffIdentity } from './hooks/useStaffIdentity';
import { useRegistrationDetailsQuery } from './hooks/useRegistrationDetailsQuery';
import { useAdminScope } from './hooks/useAdminScope';
import {
  markRegistrationPrinted,
  usePrintStatus,
} from './hooks/usePrintStatus';
import { normalizeSearch } from './utils/adminFormatters';
import { exportRegistrationsToExcel } from './utils/exportRegistrationsExcel';
import { AdminHeader } from './components/AdminHeader';
import {
  CustomerNoticeModal,
  type CustomerNotificationItem,
} from './components/CustomerNoticeModal';
import { RealtimeConnectionAlert } from './components/RealtimeConnectionAlert';
import { RegistrationDetailModal } from './components/RegistrationDetailModal';
import { RegistrationsTable } from './components/RegistrationsTable';
import type { RegistrationDetails, RegistrationStatusTab } from './types';
import type { BulkPrintMode } from '../registration/bulkPrintPdf';

export type { RegistrationDetails };

const PAGE_SIZE = 15;
const NEW_REGISTRATION_NOTICE_MS = 8_000;
const REALTIME_REFETCH_DEBOUNCE_MS = 700;

export function RegistrationsPage({
  authorizedIsAdmin,
  isActiveTab = true,
}: {
  authorizedIsAdmin: boolean;
  isActiveTab?: boolean;
}) {
  const queryClient = useQueryClient();

  const { staffName, staffRole, branchIds, isLoadingIdentity, identityError } =
    useStaffIdentity();
  const { branch, setBranch, date, setDate } = useAdminScope();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<RegistrationStatusTab>('all');
  const [printFilter, setPrintFilter] = useState<
    'all' | 'unprinted' | 'partial' | 'printed'
  >('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [isCompanyMenuOpen, setIsCompanyMenuOpen] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<RegistrationDetails | null>(
    null,
  );
  const [printModalRow, setPrintModalRow] =
    useState<RegistrationDetails | null>(null);
  const [consentModalRow, setConsentModalRow] =
    useState<RegistrationDetails | null>(null);
  const [bulkPrintError, setBulkPrintError] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>(
      navigator.onLine ? 'connected' : 'offline',
    );
  const [newRegistrationNotice, setNewRegistrationNotice] =
    useState<CustomerNotificationItem | null>(null);

  const noticeTimer = useRef<number | null>(null);
  const realtimeRefetchTimer = useRef<number | null>(null);
  const hasPendingRealtimeRefetch = useRef(false);
  const companySearchInputRef = useRef<HTMLInputElement | null>(null);
  const isActiveTabRef = useRef(isActiveTab);
  isActiveTabRef.current = isActiveTab;
  const searchInputId = useId();
  const branchId = branchIds[branch];

  useEffect(() => {
    const availableCodes = Object.keys(branchIds) as BranchCode[];
    if (availableCodes.length > 0 && !branchIds[branch]) {
      setBranch(availableCodes[0]);
    }
  }, [branchIds, branch, setBranch]);

  const {
    data: fetchedRows,
    isPending: isQueryPending,
    isFetching: isQueryFetching,
    error: queryError,
    refetch: refetchRegistrations,
  } = useRegistrationDetailsQuery({
    branch,
    branchId,
    date,
  });

  const hasAvailableBranches = Object.keys(branchIds).length > 0;
  const isWaitingForBranchSync = hasAvailableBranches && !branchId;
  const isLoading =
    isLoadingIdentity ||
    isWaitingForBranchSync ||
    (Boolean(branchId) &&
      !identityError &&
      !queryError &&
      (isQueryPending || (isQueryFetching && !fetchedRows)));

  const { getStatus } = usePrintStatus();
  const rows = useMemo(() => fetchedRows ?? [], [fetchedRows]);
  const error = queryError
    ? 'Không thể tải danh sách đăng ký. Vui lòng thử lại.'
    : null;

  const printModalData = useMemo<TT25RegistrationData | null>(() => {
    const rawTarget = printModalRow || consentModalRow;
    if (!rawTarget) return null;
    return buildPrintData(rawTarget, branch);
  }, [branch, printModalRow, consentModalRow]);

  // Bulk print (Consent / TT25 merged into one PDF)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);

  useEffect(() => {
    setCheckedIds(new Set());
  }, [branch, date]);

  const toggleChecked = (ids: string[], checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  const handleBulkPrint = async (mode: BulkPrintMode) => {
    const targets = rows
      .filter((row) => checkedIds.has(row.id))
      .sort((a, b) => a.queue_number - b.queue_number);
    if (targets.length === 0 || bulkProgress) return;

    // Open the tab synchronously so the popup blocker allows it after the async work.
    const printTab = window.open('', '_blank');
    if (printTab) {
      printTab.opener = null;
      printTab.document.title = 'Đang tạo PDF in hàng loạt';
      printTab.document.body.textContent = `Đang tạo PDF cho ${targets.length} khách. Vui lòng chờ…`;
    }
    setBulkProgress(`Đang tạo 0/${targets.length}...`);
    setBulkPrintError(null);
    try {
      const { generateBulkPrintPdf } =
        await import('../registration/bulkPrintPdf');
      const url = await generateBulkPrintPdf(
        targets.map((row) => buildPrintData(row, branch)),
        mode,
        (done, total) => {
          const message = done === total ? `Đang hoàn tất PDF cho ${total} khách…` : `Đang tạo ${done}/${total}...`;
          setBulkProgress(message);
          if (printTab && !printTab.closed) printTab.document.body.textContent = message;
        },
      );
      if (printTab) {
        printTab.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `In_hang_loat_${mode}_${date}.pdf`;
        a.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);

      try {
        await Promise.all(
          targets.map((row) => markRegistrationPrinted(row.id, mode)),
        );
      } catch {
        setBulkPrintError(
          'Đã mở file in nhưng chưa lưu đủ trạng thái in. Vui lòng kiểm tra kết nối và bấm In lại để thử lại.',
        );
      }
      setCheckedIds(new Set());
    } catch (err) {
      printTab?.close();
      console.error('Bulk print failed:', err);
      window.alert('Không thể tạo file in hàng loạt. Vui lòng thử lại.');
    } finally {
      setBulkProgress(null);
    }
  };

  useEffect(() => {
    if (!isActiveTab) return;
    document.title = `Danh Sách Tiếp Nhận | ${BRANCH_NAMES[branch]} - DYM Medical Center`;
    if (hasPendingRealtimeRefetch.current) {
      hasPendingRealtimeRefetch.current = false;
      void queryClient.invalidateQueries({
        queryKey: ['registrationDetails', branch, date],
      });
    }
  }, [branch, date, isActiveTab, queryClient]);

  useEffect(() => {
    const handleOnline = () => setConnectionState('connecting');
    const handleOffline = () => setConnectionState('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Global search keyboard shortcut '/'
  useEffect(() => {
    if (!isActiveTab) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        const searchInput = document.getElementById(searchInputId);
        searchInput?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActiveTab, searchInputId]);

  // Supabase Realtime subscription for incoming registrations
  useEffect(() => {
    if (!branchId) return;

    const scheduleRegistrationsInvalidation = () => {
      if (!isActiveTabRef.current) {
        hasPendingRealtimeRefetch.current = true;
        return;
      }
      if (realtimeRefetchTimer.current !== null) return;
      realtimeRefetchTimer.current = window.setTimeout(() => {
        realtimeRefetchTimer.current = null;
        void queryClient.invalidateQueries({
          queryKey: ['registrationDetails', branch, date],
        });
      }, REALTIME_REFETCH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`registrations-page:${branchId}:${date}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'registrations',
          filter: `branch_id=eq.${branchId}`,
          select: REALTIME_REGISTRATION_COLUMNS,
        },
        (payload) => {
          if (
            isActiveTabRef.current &&
            String(payload.new.queue_date ?? '') === date &&
            typeof payload.new.queue_number === 'number'
          ) {
            const nextItem: CustomerNotificationItem = {
              id: String(payload.new.id ?? `${Date.now()}`),
              queueNumber: formatQueueNumber(payload.new.queue_number),
              fullName: String(payload.new.full_name ?? 'Khách hàng mới'),
            };

            setNewRegistrationNotice(nextItem);
            if (noticeTimer.current !== null) {
              window.clearTimeout(noticeTimer.current);
            }
            noticeTimer.current = window.setTimeout(() => {
              setNewRegistrationNotice(null);
            }, NEW_REGISTRATION_NOTICE_MS);
          }

          scheduleRegistrationsInvalidation();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'registrations',
          filter: `branch_id=eq.${branchId}`,
          select: REALTIME_REGISTRATION_COLUMNS,
        },
        () => {
          scheduleRegistrationsInvalidation();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionState('connected');
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          setConnectionState('disconnected');
        }
      });

    return () => {
      if (realtimeRefetchTimer.current !== null) {
        window.clearTimeout(realtimeRefetchTimer.current);
        realtimeRefetchTimer.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [branch, branchId, date, queryClient]);

  // Breakdown statistics
  const tabCounts = useMemo(() => {
    let waiting = 0;
    let called = 0;
    for (const row of rows) {
      if (row.first_called_at || row.state === 'completed') {
        called++;
      } else {
        waiting++;
      }
    }
    return { all: rows.length, waiting, called };
  }, [rows]);

  // Print status breakdown counts
  const printCounts = useMemo(() => {
    let unprinted = 0;
    let partial = 0;
    let printed = 0;
    for (const row of rows) {
      const st = getStatus(row.id, row.tt25_data);
      if (st.isFull) {
        printed++;
      } else if (st.isPrinted) {
        partial++;
      } else {
        unprinted++;
      }
    }
    return { unprinted, partial, printed };
  }, [getStatus, rows]);

  // Extract distinct companies for the company dropdown filter
  const companyFilterData = useMemo(() => {
    const map = new Map<string, number>();
    let individualCount = 0;

    for (const row of rows) {
      const comp = row.company_name?.trim() ?? '';
      if (comp && comp !== '—' && comp !== 'Khách vãng lai') {
        map.set(comp, (map.get(comp) ?? 0) + 1);
      } else {
        individualCount++;
      }
    }

    const companies = Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    return { companies, individualCount };
  }, [rows]);

  const filteredCompanyOptions = useMemo(() => {
    const normalized = normalizeSearch(companySearchQuery);
    if (!normalized) return companyFilterData.companies;
    return companyFilterData.companies.filter((c) =>
      normalizeSearch(c.name).includes(normalized),
    );
  }, [companyFilterData.companies, companySearchQuery]);

  const companyTriggerMeta = useMemo(() => {
    if (companyFilter === 'all') {
      return { label: 'Đơn vị: Tất cả', count: rows.length };
    }
    if (companyFilter === '__individual__') {
      return {
        label: 'Khách cá nhân',
        count: companyFilterData.individualCount,
      };
    }
    const found = companyFilterData.companies.find(
      (c) => c.name === companyFilter,
    );
    return { label: companyFilter, count: found?.count ?? 0 };
  }, [companyFilter, companyFilterData, rows.length]);

  useEffect(() => {
    if (!isCompanyMenuOpen) return;
    const timer = window.setTimeout(() => {
      companySearchInputRef.current?.focus();
    }, 20);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isCompanyMenuOpen]);

  // Filter rows by search, status tab, print status, and company
  const filteredRows = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    return rows.filter((row) => {
      // Status tab match
      if (statusFilter === 'waiting') {
        if (
          row.first_called_at ||
          row.state === 'completed' ||
          row.state === 'cancelled'
        ) {
          return false;
        }
      } else if (statusFilter === 'called') {
        if (!row.first_called_at && row.state !== 'completed') {
          return false;
        }
      }

      // Print status filter match
      if (printFilter !== 'all') {
        const st = getStatus(row.id, row.tt25_data);
        if (printFilter === 'unprinted' && st.isPrinted) return false;
        if (printFilter === 'partial' && (!st.isPrinted || st.isFull))
          return false;
        if (printFilter === 'printed' && !st.isFull) return false;
      }

      // Company filter match
      if (companyFilter !== 'all') {
        const comp = row.company_name?.trim() ?? '';
        const isIndividual = !comp || comp === '—' || comp === 'Khách vãng lai';
        if (companyFilter === '__individual__') {
          if (!isIndividual) return false;
        } else if (comp !== companyFilter) {
          return false;
        }
      }

      // Query match
      if (!normalizedQuery) return true;

      const searchableText = [
        formatQueueNumber(row.queue_number),
        row.full_name,
        row.birth_date,
        row.gender,
        row.phone_number,
        row.identity_document,
        row.company_name,
        row.reception_note,
        row.province,
        row.ward,
        row.address_detail,
      ].join(' ');

      return normalizeSearch(searchableText).includes(normalizedQuery);
    });
  }, [companyFilter, getStatus, printFilter, query, rows, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (visiblePage - 1) * PAGE_SIZE;
  const paginatedRows = useMemo(
    () => filteredRows.slice(pageStartIndex, pageStartIndex + PAGE_SIZE),
    [filteredRows, pageStartIndex],
  );
  const firstVisibleRow = filteredRows.length === 0 ? 0 : pageStartIndex + 1;
  const lastVisibleRow = Math.min(
    pageStartIndex + PAGE_SIZE,
    filteredRows.length,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [branch, date, query, statusFilter, printFilter, companyFilter]);

  useEffect(() => {
    setCompanyFilter('all');
    setCompanySearchQuery('');
    setIsCompanyMenuOpen(false);
  }, [branch, date]);

  const availableBranches = Object.keys(BRANCH_NAMES) as BranchCode[];

  return (
    <AdminLayout
      activePage="registrations"
      branch={branch}
      date={date}
      staffName={staffName}
      isAdmin={authorizedIsAdmin}
      staffRole={authorizedIsAdmin ? 'admin' : staffRole}
    >
      {/* Unified Clinical Precision Header */}
      <AdminHeader
        title="Danh sách tiếp nhận"
        branch={branch}
        branchOptions={availableBranches.map((code) => ({
          value: code,
          label: BRANCH_NAMES[code],
        }))}
        onBranchChange={(nextBranch) => {
          setBranch(nextBranch);
          setQuery('');
        }}
        date={date}
        onDateChange={(nextDate) => {
          setDate(nextDate);
          setQuery('');
        }}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isLoading || filteredRows.length === 0}
              onClick={() =>
                exportRegistrationsToExcel({
                  rows: filteredRows,
                  branch,
                  date,
                })
              }
              title={
                filteredRows.length === 0
                  ? 'Không có dữ liệu để xuất Excel'
                  : `Xuất ${filteredRows.length} hồ sơ ra file Excel (.xlsx)`
              }
              className="h-9 gap-1.5 bg-card px-3 text-xs font-medium shadow-sm"
            >
              <ArrowDownTrayIcon
                className="size-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>Xuất Excel</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-busy={isLoading}
              disabled={isLoading}
              onClick={() => void refetchRegistrations()}
              title="Làm mới danh sách dữ liệu (F5)"
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
      />

      <CustomerNoticeModal
        notification={newRegistrationNotice}
        onClose={() => setNewRegistrationNotice(null)}
      />

      <main className="dym-admin-content">
        <RealtimeConnectionAlert state={connectionState} />

        {(error || identityError) && (
          <div className="dym-data-error" role="alert">
            {error || identityError}
          </div>
        )}

        {/* Precision Table Section */}
        <section
          className="dym-registry-panel"
          aria-labelledby="registry-table-title"
        >
          {/* Toolbar with Title Header + shadcn/ui Filter & Search Controls */}
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
            <div className="dym-registry-title-block">
              <h2 id="registry-table-title" className="dym-registry-title">
                Danh Sách Chi Tiết Khách Hàng
              </h2>
            </div>

            {/* Full-width aligned shadcn/ui Filter & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Status Filter Tabs (shadcn Tabs + Badge) */}
              <Tabs
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as RegistrationStatusTab)
                }
              >
                <TabsList
                  aria-label="Lọc hồ sơ theo trạng thái"
                  className="h-9 bg-muted p-1"
                >
                  <TabsTrigger
                    value="all"
                    className="h-7 gap-1.5 px-3 text-xs font-medium"
                  >
                    <span>Tất cả</span>
                    <Badge
                      variant="secondary"
                      className="h-5 min-w-5 justify-center rounded-full bg-foreground/[0.06] px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground shadow-none group-data-[state=active]:bg-muted group-data-[state=active]:text-foreground"
                    >
                      {tabCounts.all}
                    </Badge>
                  </TabsTrigger>

                  <TabsTrigger
                    value="waiting"
                    className="h-7 gap-1.5 px-3 text-xs font-medium"
                  >
                    <span
                      className="size-1.5 rounded-full bg-amber-500"
                      aria-hidden="true"
                    />
                    <span>Chờ gọi</span>
                    <Badge
                      variant="secondary"
                      className="h-5 min-w-5 justify-center rounded-full bg-foreground/[0.06] px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground shadow-none group-data-[state=active]:bg-muted group-data-[state=active]:text-foreground"
                    >
                      {tabCounts.waiting}
                    </Badge>
                  </TabsTrigger>

                  <TabsTrigger
                    value="called"
                    className="h-7 gap-1.5 px-3 text-xs font-medium"
                  >
                    <span
                      className="size-1.5 rounded-full bg-emerald-500"
                      aria-hidden="true"
                    />
                    <span>Đã gọi</span>
                    <Badge
                      variant="secondary"
                      className="h-5 min-w-5 justify-center rounded-full bg-foreground/[0.06] px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground shadow-none group-data-[state=active]:bg-muted group-data-[state=active]:text-foreground"
                    >
                      {tabCounts.called}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Right Filter & Search Controls */}
              <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
                {/* Print Status Filter (shadcn Select + SelectGroup) */}
                <Select
                  value={printFilter}
                  onValueChange={(value) =>
                    setPrintFilter(
                      value as 'all' | 'unprinted' | 'partial' | 'printed',
                    )
                  }
                >
                  <SelectTrigger
                    aria-label="Lọc theo trạng thái in"
                    className={cn(
                      'h-9 w-[215px] bg-card px-3 text-xs font-medium shadow-sm',
                      printFilter !== 'all' &&
                        'border-ring bg-accent text-accent-foreground',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-1.5 truncate">
                      <Printer
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <SelectValue placeholder="Trạng thái in" />
                    </div>
                  </SelectTrigger>
                  <SelectContent align="end" className="w-[215px]">
                    <SelectGroup>
                      <SelectItem value="all" className="text-xs tabular-nums">
                        Trạng thái in: Tất cả ({rows.length})
                      </SelectItem>
                      <SelectItem
                        value="unprinted"
                        className="text-xs tabular-nums"
                      >
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="size-1.5 rounded-full bg-slate-400"
                            aria-hidden="true"
                          />
                          <span>Chưa in ({printCounts.unprinted})</span>
                        </span>
                      </SelectItem>
                      <SelectItem
                        value="partial"
                        className="text-xs tabular-nums"
                      >
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="size-1.5 rounded-full bg-sky-500"
                            aria-hidden="true"
                          />
                          <span>Đã in 1 phần ({printCounts.partial})</span>
                        </span>
                      </SelectItem>
                      <SelectItem
                        value="printed"
                        className="text-xs tabular-nums"
                      >
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="size-1.5 rounded-full bg-emerald-500"
                            aria-hidden="true"
                          />
                          <span>Đã in đủ ({printCounts.printed})</span>
                        </span>
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>

                {/* Company Filter (shadcn Popover + Button + Input) */}
                <Popover
                  open={isCompanyMenuOpen}
                  onOpenChange={setIsCompanyMenuOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={isCompanyMenuOpen}
                      title={`${companyTriggerMeta.label} (${companyTriggerMeta.count})`}
                      className={cn(
                        'h-9 min-w-[190px] max-w-[260px] justify-between gap-2 bg-card px-3 text-xs font-medium shadow-sm',
                        companyFilter !== 'all' &&
                          'border-ring bg-accent text-accent-foreground hover:bg-accent/80',
                      )}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                        <Building2
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          {companyTriggerMeta.label}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Badge
                          variant="secondary"
                          className="h-5 rounded px-1.5 text-[11px] font-semibold tabular-nums"
                        >
                          {companyTriggerMeta.count}
                        </Badge>
                        <ChevronsUpDown
                          className="size-3.5 shrink-0 opacity-50"
                          aria-hidden="true"
                        />
                      </span>
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent align="end" className="w-72 p-0">
                    <div className="relative flex items-center border-b border-border p-2">
                      <Search
                        className="pointer-events-none absolute left-4 size-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        ref={companySearchInputRef}
                        type="text"
                        value={companySearchQuery}
                        onChange={(e) => setCompanySearchQuery(e.target.value)}
                        placeholder="Tìm tên công ty / đơn vị..."
                        className="h-8 bg-background pl-8 pr-7 text-xs shadow-none"
                      />
                      {companySearchQuery && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setCompanySearchQuery('')}
                          aria-label="Xóa tìm kiếm công ty"
                          className="absolute right-3 size-6 text-muted-foreground hover:text-foreground"
                        >
                          <X aria-hidden="true" />
                        </Button>
                      )}
                    </div>

                    <div
                      role="listbox"
                      aria-label="Chọn đơn vị hoặc công ty"
                      className="flex max-h-60 flex-col gap-0.5 overflow-y-auto p-1.5"
                    >
                      {!companySearchQuery.trim() && (
                        <>
                          <button
                            type="button"
                            role="option"
                            aria-selected={companyFilter === 'all'}
                            onClick={() => {
                              setCompanyFilter('all');
                              setIsCompanyMenuOpen(false);
                            }}
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                              companyFilter === 'all' &&
                                'bg-accent font-medium text-accent-foreground',
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2 truncate">
                              <Check
                                className={cn(
                                  'size-3.5 shrink-0 text-primary',
                                  companyFilter === 'all'
                                    ? 'opacity-100'
                                    : 'opacity-0',
                                )}
                                aria-hidden="true"
                              />
                              <span className="truncate">Đơn vị: Tất cả</span>
                            </span>
                            <Badge
                              variant="secondary"
                              className="h-5 rounded px-1.5 text-[11px] font-semibold tabular-nums"
                            >
                              {rows.length}
                            </Badge>
                          </button>

                          <button
                            type="button"
                            role="option"
                            aria-selected={companyFilter === '__individual__'}
                            onClick={() => {
                              setCompanyFilter('__individual__');
                              setIsCompanyMenuOpen(false);
                            }}
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                              companyFilter === '__individual__' &&
                                'bg-accent font-medium text-accent-foreground',
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2 truncate">
                              <Check
                                className={cn(
                                  'size-3.5 shrink-0 text-primary',
                                  companyFilter === '__individual__'
                                    ? 'opacity-100'
                                    : 'opacity-0',
                                )}
                                aria-hidden="true"
                              />
                              <span className="truncate">Khách cá nhân</span>
                            </span>
                            <Badge
                              variant="secondary"
                              className="h-5 rounded px-1.5 text-[11px] font-semibold tabular-nums"
                            >
                              {companyFilterData.individualCount}
                            </Badge>
                          </button>
                        </>
                      )}

                      {filteredCompanyOptions.length > 0 ? (
                        filteredCompanyOptions.map((c) => {
                          const isSelected = companyFilter === c.name;
                          return (
                            <button
                              key={c.name}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              title={c.name}
                              onClick={() => {
                                setCompanyFilter(c.name);
                                setIsCompanyMenuOpen(false);
                              }}
                              className={cn(
                                'flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                                isSelected &&
                                  'bg-accent font-medium text-accent-foreground',
                              )}
                            >
                              <span className="flex min-w-0 items-center gap-2 truncate">
                                <Check
                                  className={cn(
                                    'size-3.5 shrink-0 text-primary',
                                    isSelected ? 'opacity-100' : 'opacity-0',
                                  )}
                                  aria-hidden="true"
                                />
                                <span className="truncate">{c.name}</span>
                              </span>
                              <Badge
                                variant="secondary"
                                className="h-5 rounded px-1.5 text-[11px] font-semibold tabular-nums"
                              >
                                {c.count}
                              </Badge>
                            </button>
                          );
                        })
                      ) : companySearchQuery.trim() ? (
                        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                          Không tìm thấy đơn vị phù hợp
                        </div>
                      ) : null}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Search Field (shadcn Input + Clear Button / Kbd) */}
                <div className="relative w-full sm:w-64 lg:w-72">
                  <label htmlFor={searchInputId} className="sr-only">
                    Tìm kiếm hồ sơ khách hàng
                  </label>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id={searchInputId}
                    type="search"
                    placeholder="Tìm tên, SĐT, CCCD, công ty..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-9 bg-card pl-8 pr-8 text-xs shadow-sm"
                  />
                  {query ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setQuery('')}
                      aria-label="Xóa từ khóa tìm kiếm"
                      className="absolute right-1.5 top-1/2 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  ) : (
                    <kbd
                      className="pointer-events-none absolute right-2 top-1/2 inline-flex h-5 -translate-y-1/2 select-none items-center rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground"
                      title="Phím tắt: /"
                    >
                      /
                    </kbd>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Data Table Content */}
          {isLoading ? (
            <div
              className="dym-table-scroller"
              aria-busy="true"
              aria-live="polite"
              aria-label="Đang tải danh sách đăng ký"
            >
              <table className="dym-table-precision">
                <thead>
                  <tr>
                    <th scope="col">Số Phiếu & Giờ</th>
                    <th scope="col">Tên Khách Hàng</th>
                    <th scope="col">Liên Hệ & Định Danh</th>
                    <th scope="col">Đơn Vị & Địa Chỉ</th>
                    <th scope="col">Ghi chú / STT HIS</th>
                    <th scope="col">Trạng Thái</th>
                    <th scope="col">Trạng Thái In</th>
                    <th scope="col" className="text-right">
                      Hồ Sơ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index}>
                      <td className="col-ticket">
                        <div className="flex flex-col items-start gap-1.5">
                          <Skeleton className="h-6 w-14 rounded-md" />
                          <Skeleton className="h-3 w-11" />
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-36" />
                            <Skeleton className="h-4 w-9 rounded" />
                          </div>
                          <Skeleton className="h-3 w-28" />
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-1.5">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-28" />
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-1.5">
                          <Skeleton className="h-4 w-44" />
                          <Skeleton className="h-3 w-52" />
                        </div>
                      </td>
                      <td><Skeleton className="h-8 w-52 rounded" /></td>
                      <td>
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </td>
                      <td>
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </td>
                      <td className="text-right">
                        <div className="dym-table-actions-group">
                          <Skeleton className="h-7 w-16 rounded-md" />
                          <Skeleton className="h-7 w-24 rounded-md" />
                          <Skeleton className="h-7 w-16 rounded-md" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="dym-table-empty-box">
              <div className="dym-empty-icon-wrap">
                <UserGroupIcon
                  className="w-7 h-7 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <h3 className="dym-empty-title">Không tìm thấy hồ sơ đăng ký</h3>
              <p className="dym-empty-desc">
                Không có khách hàng nào phù hợp với bộ lọc hiện tại. Hãy thử đổi
                ngày, chi nhánh hoặc xóa từ khóa tìm kiếm.
              </p>
              {(query ||
                statusFilter !== 'all' ||
                printFilter !== 'all' ||
                companyFilter !== 'all') && (
                <button
                  type="button"
                  className="dym-btn-reset-filter"
                  onClick={() => {
                    setQuery('');
                    setStatusFilter('all');
                    setPrintFilter('all');
                    setCompanyFilter('all');
                  }}
                >
                  Đặt lại bộ lọc
                </button>
              )}
            </div>
          ) : (
            <>
              <div
                className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-xs"
                role="toolbar"
                aria-label="In hàng loạt"
              >
                <Printer
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="font-medium">
                  {checkedIds.size > 0
                    ? `Đã chọn ${checkedIds.size} hồ sơ`
                    : 'In hàng loạt'}
                </span>
                {checkedIds.size < filteredRows.length && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-7 px-1 text-xs"
                    onClick={() =>
                      toggleChecked(
                        filteredRows.map((r) => r.id),
                        true,
                      )
                    }
                  >
                    Chọn tất cả
                  </Button>
                )}
                {checkedIds.size > 0 && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setCheckedIds(new Set())}
                    >
                      Bỏ chọn
                    </Button>
                    {bulkProgress ? (
                      <span
                        className="font-medium text-foreground"
                        role="status"
                      >
                        {bulkProgress}
                      </span>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 bg-card px-3 text-xs"
                          onClick={() => void handleBulkPrint('consent')}
                        >
                          In Đồng thuận
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 bg-card px-3 text-xs"
                          onClick={() => void handleBulkPrint('tt25')}
                        >
                          In TT25
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 px-3 text-xs"
                          onClick={() => void handleBulkPrint('both')}
                          title="Mỗi khách: phiếu Đồng thuận rồi phiếu TT25, theo thứ tự số phiếu"
                        >
                          In trọn bộ ({checkedIds.size})
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
              {bulkPrintError && (
                <p role="alert" className="p-4 text-sm text-red-600">
                  {bulkPrintError}
                </p>
              )}
              <RegistrationsTable
                rows={paginatedRows}
                onNoteSaved={(id, note) => {
                  queryClient.setQueryData<RegistrationDetails[]>(['registrationDetails', branch, date],
                    (current) => current?.map((row) => row.id === id ? { ...row, reception_note: note } : row));
                  void queryClient.invalidateQueries({ queryKey: ['registrationDetails', branch, date] });
                }}
                searchQuery={query}
                checkedIds={checkedIds}
                onToggleChecked={toggleChecked}
                onSelectRow={(row) => setSelectedRow(row)}
                onPrintRow={(row) => {
                  setPrintModalRow(row);
                }}
                onPrintConsentRow={(row) => {
                  setConsentModalRow(row);
                }}
              />
            </>
          )}

          {/* Pagination Bar */}
          {!isLoading && filteredRows.length > 0 && (
            <div className="dym-pagination-bar">
              <span className="dym-pagination-summary">
                Hiển thị <strong>{firstVisibleRow}</strong>–
                <strong>{lastVisibleRow}</strong> trong{' '}
                <strong>{filteredRows.length}</strong> đăng ký
              </span>
              <div className="dym-pagination-pager">
                <button
                  type="button"
                  className="dym-page-btn"
                  disabled={visiblePage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  aria-label="Trang trước"
                >
                  <ChevronLeftIcon className="w-3.5 h-3.5" />
                  <span>Trước</span>
                </button>
                <span className="dym-page-indicator">
                  Trang <strong>{visiblePage}</strong> / {totalPages}
                </span>
                <button
                  type="button"
                  className="dym-page-btn"
                  disabled={visiblePage === totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  aria-label="Trang sau"
                >
                  <span>Sau</span>
                  <ChevronRightIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Patient Detail Drawer */}
        <RegistrationDetailModal
          selectedRow={rows.find((row) => row.id === selectedRow?.id) ?? null}
          branch={branch}
          onClose={() => setSelectedRow(null)}
          onUpdated={(updated) => {
            queryClient.setQueryData<RegistrationDetails[]>(
              ['registrationDetails', branch, date],
              (current) =>
                current?.map((row) => (row.id === updated.id ? updated : row)),
            );
            void queryClient.invalidateQueries({
              queryKey: ['dashboardQueue', branch, date],
            });
            void queryClient.invalidateQueries({
              queryKey: ['registrationDetails', branch, date],
            });
          }}
          onPrint={(row) => {
            setPrintModalRow(row);
          }}
          onPrintConsent={(row) => {
            setConsentModalRow(row);
          }}
        />

        {/* TT25 Print Preview Modal */}
        {printModalRow && printModalData && (
          <Suspense fallback={null}>
            <TT25PrintModal
              key={printModalRow.id}
              isOpen={Boolean(printModalRow)}
              onClose={() => setPrintModalRow(null)}
              data={printModalData}
              onPrinted={() =>
                markRegistrationPrinted(printModalRow.id, 'tt25')
              }
            />
          </Suspense>
        )}

        {/* Consent Print Preview Modal */}
        {consentModalRow && printModalData && (
          <Suspense fallback={null}>
            <ConsentPrintModal
              key={consentModalRow.id}
              isOpen={Boolean(consentModalRow)}
              onClose={() => setConsentModalRow(null)}
              data={printModalData}
              onPrinted={() =>
                markRegistrationPrinted(consentModalRow.id, 'consent')
              }
            />
          </Suspense>
        )}
      </main>
    </AdminLayout>
  );
}

export default RegistrationsPage;
