import { SearchField } from '@/components/search-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AdminLayout } from '../shell/AdminLayout';
import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { Building2, Check, ChevronsUpDown, Printer } from 'lucide-react';

import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { PermissionButton as Button } from '@/features/admin/shared/PermissionButton';

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
import { DatePicker, MonthPicker } from '@/components/ui/date-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateForPrint } from '@/lib/date';
import { cn } from '@/lib/utils';

import { type TT25RegistrationData } from '../../registration/tt25Types';
import { buildPrintData } from './buildPrintData';

const TT25PrintModal = lazy(() => import('../../registration/printing/TT25PrintModal'));
const ConsentPrintModal = lazy(
  () => import('../../registration/printing/ConsentPrintModal'),
);

import { BRANCH_NAMES } from '../../../config/branches';
import { formatQueueNumber } from '../../../lib/queueNumber';
import { supabase } from '../../../lib/supabaseClient';
import type { BranchCode } from '../../../types/domain';

import {
  REALTIME_REGISTRATION_COLUMNS,
  type RealtimeConnectionState,
} from '../reception/queueConstants';

import '../shell/admin.css';
import '../shared/reception.css';
import './registrations.css';

import type { StaffIdentity } from '../shared/useStaffIdentity';
import { useRegistrationDetailsQuery } from './useRegistrationDetailsQuery';
import { useAdminScope } from '../shared/useAdminScope';
import {
  markRegistrationPrinted,
  usePrintStatus,
} from './usePrintStatus';
import { normalizeSearch } from '../shared/adminFormatters';
import { exportRegistrationsToExcel } from './exportRegistrationsExcel';
import { fetchRegistrationExportRows, getRegistrationExportDates, type RegistrationExportPeriod } from './registrationExportRange';
import { AdminHeader } from '../shell/AdminHeader';
import {
  CustomerNoticeModal,
  type CustomerNotificationItem,
} from '../shared/CustomerNoticeModal';
import { RealtimeConnectionAlert } from '../shared/RealtimeConnectionAlert';
import { RegistrationDetailModal } from './RegistrationDetailModal';
import { RegistrationsTable } from './RegistrationsTable';
import type { RegistrationDetails, RegistrationStatusTab } from './types';
import type { BulkPrintMode } from '../../registration/printing/bulkPrintPdf';

export type { RegistrationDetails };

const NEW_REGISTRATION_NOTICE_MS = 8_000;
const REALTIME_REFETCH_DEBOUNCE_MS = 700;
const EXPORT_OPTIONS = [
  { period: 'day', label: 'Ngày' },
  { period: 'week', label: 'Tuần' },
  { period: 'month', label: 'Tháng' },
] as const;

export function RegistrationsPage({
  authorizedIsAdmin,
  staffIdentity,
  isActiveTab = true,
}: {
  authorizedIsAdmin: boolean;
  staffIdentity: StaffIdentity;
  isActiveTab?: boolean;
}) {
  const queryClient = useQueryClient();

  const { staffName, staffRole, branchIds, isLoadingIdentity, identityError } =
    staffIdentity;
  const { branch, setBranch, date, setDate } = useAdminScope();

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] =
    useState<RegistrationStatusTab>('all');
  const [printFilter, setPrintFilter] = useState<
    'all' | 'unprinted' | 'partial' | 'printed'
  >('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [isCompanyMenuOpen, setIsCompanyMenuOpen] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [selectedRow, setSelectedRow] = useState<RegistrationDetails | null>(
    null,
  );
  const [printModalRow, setPrintModalRow] =
    useState<RegistrationDetails | null>(null);
  const [consentModalRow, setConsentModalRow] =
    useState<RegistrationDetails | null>(null);
  const [bulkPrintError, setBulkPrintError] = useState<string | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [exportPeriod, setExportPeriod] = useState<'day' | RegistrationExportPeriod>('day');
  const [exportDate, setExportDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
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
  const pageHeaderRef = useRef<HTMLElement>(null);
  const registryToolbarRef = useRef<HTMLDivElement>(null);
  const bulkToolbarRef = useRef<HTMLDivElement>(null);
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

  const toggleChecked = useCallback((ids: string[], checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

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
        await import('../../registration/printing/bulkPrintPdf');
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
      setBulkPrintError('Không thể tạo file in hàng loạt. Vui lòng thử lại.');
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

    let refreshOnSubscribe = false;
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
          if (refreshOnSubscribe) scheduleRegistrationsInvalidation();
          refreshOnSubscribe = true;
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          setConnectionState('disconnected');
          refreshOnSubscribe = true;
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
      return { label: 'Tất cả đơn vị', count: rows.length };
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
  const filterRows = useCallback((sourceRows: RegistrationDetails[], searchQuery: string) => {
    const normalizedQuery = normalizeSearch(searchQuery);

    return sourceRows.filter((row) => {
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
        row.phone_number,
        row.identity_document,
      ].join(' ');

      return normalizeSearch(searchableText).includes(normalizedQuery);
    });
  }, [companyFilter, getStatus, printFilter, statusFilter]);
  const newestFirstRows = useMemo(
    () => [...rows].sort((a, b) =>
      Date.parse(b.registered_at) - Date.parse(a.registered_at) || b.queue_number - a.queue_number,
    ),
    [rows],
  );
  const filteredRows = useMemo(
    () => filterRows(newestFirstRows, deferredQuery),
    [deferredQuery, filterRows, newestFirstRows],
  );
  const showBulkToolbar = !isLoading && filteredRows.length > 0;

  useLayoutEffect(() => {
    const header = pageHeaderRef.current;
    const toolbar = registryToolbarRef.current;
    const bulkToolbar = bulkToolbarRef.current;
    const workspace = toolbar?.closest<HTMLElement>('.dym-admin-workspace');
    if (!header || !toolbar || !workspace) return;

    const updateStickyOffsets = () => {
      const headerHeight = header.getBoundingClientRect().height;
      const bulkOffset = headerHeight + toolbar.getBoundingClientRect().height;
      const bulkHeight = bulkToolbar?.getBoundingClientRect().height ?? 0;
      workspace.style.setProperty('--registry-header-height', `${headerHeight}px`);
      workspace.style.setProperty('--registry-bulk-offset', `${bulkOffset}px`);
      workspace.style.setProperty('--registry-column-offset', `${bulkOffset + bulkHeight}px`);
    };
    const observer = new ResizeObserver(updateStickyOffsets);
    observer.observe(header);
    observer.observe(toolbar);
    if (bulkToolbar) observer.observe(bulkToolbar);
    updateStickyOffsets();
    return () => observer.disconnect();
  }, [showBulkToolbar]);

  const registrationsTable = useMemo(
    () => (
      <RegistrationsTable
        rows={filteredRows}
        onNoteSaved={(id, note) => {
          queryClient.setQueryData<RegistrationDetails[]>(['registrationDetails', branch, date],
            (current) => current?.map((row) => row.id === id ? { ...row, reception_note: note } : row));
          void queryClient.invalidateQueries({ queryKey: ['registrationDetails', branch, date] });
        }}
        searchQuery={deferredQuery}
        checkedIds={checkedIds}
        onToggleChecked={toggleChecked}
        onSelectRow={setSelectedRow}
        onPrintRow={setPrintModalRow}
        onPrintConsentRow={setConsentModalRow}
      />
    ),
    [branch, checkedIds, date, deferredQuery, filteredRows, queryClient, toggleChecked],
  );

  const exportAnchor = exportDate || date;
  const exportDays = exportPeriod === 'day'
    ? [exportAnchor]
    : getRegistrationExportDates(exportAnchor, exportPeriod);
  const exportStart = exportDays[0];
  const exportEnd = exportDays[exportDays.length - 1];
  const useVisibleDay = exportPeriod === 'day' && exportAnchor === date;

  async function handleExport() {
    setIsExportMenuOpen(false);
    setExportMessage(null);
    setIsExporting(true);
    try {
      const exportRows = useVisibleDay
        ? filterRows(rows, query)
        : filterRows(await fetchRegistrationExportRows(branch, exportDays), query);
      if (!exportRows.length) {
        setExportMessage('Không có hồ sơ phù hợp trong khoảng thời gian đã chọn.');
        return;
      }
      exportRegistrationsToExcel({
        rows: exportRows,
        branch,
        date: exportStart === exportEnd ? exportStart : `${exportStart}_${exportEnd}`,
      });
    } catch {
      setExportMessage('Không thể xuất Excel. Vui lòng thử lại.');
    } finally {
      setIsExporting(false);
    }
  }

  useEffect(() => {
    setCompanyFilter('all');
    setCompanySearchQuery('');
    setIsCompanyMenuOpen(false);
  }, [branch, date]);

  const availableBranches = Object.keys(BRANCH_NAMES) as BranchCode[];

  return (
    <AdminLayout
      activePage="registrations"
      className="dym-scroll-registry"
      branch={branch}
      date={date}
      staffName={staffName}
      isAdmin={authorizedIsAdmin}
      staffRole={authorizedIsAdmin ? 'admin' : staffRole}
    >
      {/* Unified Clinical Precision Header */}
      <AdminHeader
        ref={pageHeaderRef}
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
            <Popover open={isExportMenuOpen} onOpenChange={(open) => {
              if (open) setExportDate(date);
              setIsExportMenuOpen(open);
            }}>
              <PopoverTrigger asChild>
                <Button
                  permissionAction="view"
                  permissionModule="export"
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-busy={isExporting}
                  disabled={!branchId || !date || isLoadingIdentity || Boolean(identityError) || isExporting}
                  className="h-9 gap-1.5 bg-card px-3 text-xs font-medium shadow-sm"
                >
                  <ArrowDownTrayIcon data-icon="inline-start" aria-hidden="true" />
                  <span>{isExporting ? 'Đang xuất…' : 'Xuất Excel'}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" aria-label="Khoảng thời gian xuất Excel" className="flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 p-4">
                <div role="group" aria-label="Xuất theo" className="grid grid-cols-3 gap-1">
                  {EXPORT_OPTIONS.map(({ period, label }) => (
                    <Button
                      key={period}
                      type="button"
                      variant={exportPeriod === period ? 'secondary' : 'ghost'}
                      size="sm"
                      aria-pressed={exportPeriod === period}
                      onClick={() => setExportPeriod(period)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {exportPeriod === 'month' ? (
                  <MonthPicker
                    value={exportAnchor.slice(0, 7)}
                    onChange={(month) => setExportDate(`${month}-01`)}
                    align="end"
                    className="w-full justify-start shadow-none"
                  />
                ) : (
                  <DatePicker
                    value={exportAnchor}
                    onChange={setExportDate}
                    title={exportPeriod === 'week' ? 'Chọn một ngày trong tuần muốn xuất' : 'Chọn ngày muốn xuất'}
                    align="end"
                    className="w-full justify-start shadow-none"
                  />
                )}
                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">
                    {exportPeriod === 'week' ? 'Khoảng xuất · Thứ Hai đến Chủ nhật' : 'Khoảng xuất'}
                  </span>
                  <output className="font-medium tabular-nums">
                    {formatDateForPrint(exportStart)}
                    {exportStart !== exportEnd && ` – ${formatDateForPrint(exportEnd)}`}
                  </output>
                </div>
                <Button
                  permissionAction="view"
                  permissionModule="export"
                  type="button"
                  size="sm"
                  disabled={!exportStart || (useVisibleDay && isLoading)}
                  onClick={() => void handleExport()}
                >
                  Tải file Excel
                </Button>
              </PopoverContent>
            </Popover>

          </div>
        }
      />

      <CustomerNoticeModal
        notification={newRegistrationNotice}
        onClose={() => setNewRegistrationNotice(null)}
      />

      <main className="dym-admin-content dym-reception-page dym-registrations-page">
        <RealtimeConnectionAlert state={connectionState} />
        {exportMessage && (
          <Alert className="mb-4"><AlertDescription>{exportMessage}</AlertDescription></Alert>
        )}

        {(error || identityError) && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{identityError || error}</AlertDescription>
            {queryError && !identityError && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={isQueryFetching}
                onClick={() => void refetchRegistrations()}
              >
                {isQueryFetching ? 'Đang tải…' : 'Thử lại'}
              </Button>
            )}
          </Alert>
        )}

        {/* Precision Table Section */}
        <section
          className="dym-registry-panel"
          aria-labelledby="registry-table-title"
        >
          {/* Toolbar with Title Header + shadcn/ui Filter & Search Controls */}
          <div ref={registryToolbarRef} className="dym-registration-toolbar flex flex-col gap-3 border-b border-border px-5 py-4">
            <div className="dym-registry-title-block">
              <h2 id="registry-table-title" className="dym-registry-title">
                Danh sách khách hàng
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
              <div className="dym-registration-filters">
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
                      'dym-registration-print-filter bg-card px-3 text-sm font-normal shadow-none',
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
                  <SelectContent align="end" className="dym-registration-filter-menu min-w-[240px]">
                    <SelectGroup>
                      <SelectItem value="all" className="tabular-nums">
                        Tất cả bản in ({rows.length})
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
                        'dym-registration-company-filter justify-between gap-2 bg-card px-3 text-sm font-normal shadow-none',
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

                  <PopoverContent align="end" className="dym-registration-filter-menu w-80 max-w-[calc(100vw-32px)] p-0">
                    <div className="border-b border-border p-2">
                      <SearchField
                        ref={companySearchInputRef}
                        value={companySearchQuery}
                        onChange={(e) => setCompanySearchQuery(e.target.value)}
                        onClear={() => setCompanySearchQuery('')}
                        aria-label="Tìm đơn vị"
                        placeholder="Tìm đơn vị…"
                        className="w-full"
                      />
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
                              <span className="truncate">Tất cả đơn vị</span>
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
                <SearchField
                id={searchInputId}
                placeholder="Tìm số phiếu, tên, SĐT, CCCD/hộ chiếu…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Tìm kiếm hồ sơ khách hàng"
                onClear={() => setQuery('')}
                shortcut
              />
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
                    <th scope="col">Ghi chú</th>
                    <th scope="col">Liên Hệ & Định Danh</th>
                    <th scope="col">Đơn Vị & Địa Chỉ</th>
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
                      <td><Skeleton className="h-8 w-52 rounded" /></td>
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
            <div className="dym-table-empty-box" role="status">
              <h3 className="dym-empty-title">
                {rows.length === 0
                  ? 'Chưa có khách đăng ký trong ngày này'
                  : 'Không có hồ sơ phù hợp'}
              </h3>
              <p className="dym-empty-desc">
                {rows.length === 0
                  ? 'Chọn ngày hoặc chi nhánh khác để xem danh sách tiếp nhận.'
                  : 'Thử thay đổi bộ lọc hoặc xóa từ khóa để xem lại danh sách khách hàng.'}
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
                ref={bulkToolbarRef}
                className="dym-bulk-toolbar flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border px-4 py-2 text-sm"
                role="group"
                aria-label="In hàng loạt"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium tabular-nums" aria-live="polite">
                    {checkedIds.size > 0
                      ? `Đã chọn ${checkedIds.size} hồ sơ`
                      : 'In hàng loạt'}
                  </span>
                  {checkedIds.size < filteredRows.length && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleChecked(filteredRows.map((row) => row.id), true)}
                    >
                      Chọn tất cả
                    </Button>
                  )}
                  {checkedIds.size > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCheckedIds(new Set())}
                    >
                      Bỏ chọn tất cả
                    </Button>
                  )}
                </div>
                {checkedIds.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tùy chọn in">
                    {bulkProgress ? (
                      <span
                        className="font-medium text-foreground"
                        role="status"
                      >
                        {bulkProgress}
                      </span>
                    ) : (
                      <>
                        <Button permissionAction="view" permissionModule="printing"
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleBulkPrint('consent')}
                        >
                          In đồng thuận
                        </Button>
                        <Button permissionAction="view" permissionModule="printing"
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleBulkPrint('tt25')}
                        >
                          In TT25
                        </Button>
                        <Button permissionAction="view" permissionModule="printing"
                          type="button"
                          size="sm"
                          className="dym-bulk-print-primary"
                          onClick={() => void handleBulkPrint('both')}
                          title="Mỗi khách: phiếu Đồng thuận rồi phiếu TT25, theo thứ tự số phiếu"
                        >
                          In trọn bộ
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {bulkPrintError && (
                <Alert variant="destructive"><AlertDescription>
                  {bulkPrintError}
                </AlertDescription></Alert>
              )}
              {registrationsTable}
            </>
          )}

          {showBulkToolbar && (
            <div className="dym-pagination-bar">
              <span className="dym-pagination-summary">
                <strong>{filteredRows.length}</strong> hồ sơ
              </span>
            </div>
          )}
        </section>

        {/* Patient Detail Drawer */}
        <RegistrationDetailModal
          selectedRow={rows.find((row) => row.id === selectedRow?.id) ?? null}
          branch={branch}
          onClose={() => setSelectedRow(null)}
          onHistoryUpdated={(id, medicalHistory) => {
            queryClient.setQueryData<RegistrationDetails[]>(['registrationDetails', branch, date],
              (current) => current?.map((row) => row.id === id
                ? { ...row, tt25_data: { ...row.tt25_data, medicalHistory } } : row));
            void queryClient.invalidateQueries({ queryKey: ['registrationDetails', branch, date] });
          }}
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
