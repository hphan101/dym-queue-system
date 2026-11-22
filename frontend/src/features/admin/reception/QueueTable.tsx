import { SearchField } from '@/components/search-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStaffPermissions } from '@/features/admin/shared/useStaffPermissions';
import { lazy, Suspense, useCallback, useId, useMemo, useState } from 'react';
import {
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';

import { Badge } from '@/components/ui/badge';

import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { BranchCode } from '../../../types/domain';
import { STATUS_META, type QueueStatus } from './queueConstants';
import { usePrintStatus } from '../registrations/usePrintStatus';
import { calculateAge, formatPhone } from '../shared/adminFormatters';
import { supabase } from '../../../lib/supabaseClient';
import type { RegistrationDetails } from '../registrations/useRegistrationDetailsQuery';
import type { TT25StoredExtras } from '../registrations/types';
import type { TT25RegistrationData } from '../../registration/tt25Types';
import { buildPrintData } from '../registrations/buildPrintData';
import { HighlightText } from '../shared/HighlightText';

const TT25PrintModal = lazy(() => import('../../registration/printing/TT25PrintModal'));
const ConsentPrintModal = lazy(
  () => import('../../registration/printing/ConsentPrintModal'),
);

export interface RegistrationRow {
  id: string;
  queueNumber: string;
  registeredAt: string;
  date: string;
  fullName: string;
  birthDate: string;
  gender: string;
  phone: string;
  companyName: string;
  branch: BranchCode;
  status: QueueStatus;
  tt25_data?: TT25StoredExtras | null;
}

interface QueueTableProps {
  statusFilter: TableStatusFilter;
  onStatusFilterChange: (status: TableStatusFilter) => void;
  filteredRows: RegistrationRow[];
  query: string;
  resultQuery: string;
  onQueryChange: (query: string) => void;
  canSearchIdentity: boolean;
  hasIdentitySearchError: boolean;
  isDataLoading: boolean;
  isMutating: boolean;
  pendingUndoId: string | null;
  branchName: string;
  date: string;
  today: string;
  onReturnToWaiting: (row: RegistrationRow) => void;
}

type TableStatusFilter = 'all' | 'waiting' | 'called';

export function QueueTable({
  statusFilter,
  onStatusFilterChange,
  filteredRows,
  query,
  resultQuery,
  onQueryChange,
  canSearchIdentity,
  hasIdentitySearchError,
  isDataLoading,
  isMutating,
  pendingUndoId,
  branchName,
  date,
  today,
  onReturnToWaiting,
}: QueueTableProps) {
  const { can } = useStaffPermissions();
  const canPrint = can('printing');
  const searchInputId = useId();
  const [printModalData, setPrintModalData] = useState<TT25RegistrationData | null>(null);
  const [consentModalData, setConsentModalData] = useState<TT25RegistrationData | null>(null);
  const [activePrintRowId, setActivePrintRowId] = useState<string | null>(null);
  const [loadingPrintId, setLoadingPrintId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const { getStatus, markPrinted } = usePrintStatus();

  const fetchRowPrintData = useCallback(async (row: RegistrationRow): Promise<TT25RegistrationData> => {
    if (!canPrint) throw new Error('Tài khoản chưa được cấp quyền in hồ sơ.');
    try {
      const { data, error } = await supabase.rpc(
        'get_registration_details',
        {
          p_branch_code: row.branch,
          p_queue_date: row.date,
        },
      ).eq('id', row.id).maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('REGISTRATION_NOT_FOUND');
      return buildPrintData(data as RegistrationDetails, row.branch);
    } catch (err) {
      console.error('Error getting print details:', err);
      throw new Error('Không thể tải hồ sơ mới nhất để in. Vui lòng thử lại.');
    }
  }, [canPrint]);

  const handlePrintClick = useCallback(async (row: RegistrationRow) => {
    setLoadingPrintId(`tt25:${row.id}`);
    setPrintError(null);
    try {
      const data = await fetchRowPrintData(row);
      setActivePrintRowId(row.id);
      setPrintModalData(data);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Không thể tải hồ sơ để in.');
    } finally {
      setLoadingPrintId(null);
    }
  }, [fetchRowPrintData]);

  const handlePrintConsentClick = useCallback(async (row: RegistrationRow) => {
    setLoadingPrintId(`consent:${row.id}`);
    setPrintError(null);
    try {
      const data = await fetchRowPrintData(row);
      setActivePrintRowId(row.id);
      setConsentModalData(data);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Không thể tải hồ sơ để in.');
    } finally {
      setLoadingPrintId(null);
    }
  }, [fetchRowPrintData]);

  // Compute status counts for quick tabs
  const tabCounts = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.all += 1;
        if (r.status === 'waiting') acc.waiting += 1;
        if (r.status === 'called') acc.called += 1;
        return acc;
      },
      { all: 0, waiting: 0, called: 0 },
    );
  }, [filteredRows]);

  const displayedRows = useMemo(
    () => statusFilter === 'all' ? filteredRows : filteredRows.filter((row) => row.status === statusFilter),
    [filteredRows, statusFilter],
  );

  const tableRows = useMemo(() => displayedRows.map((row) => {
    const age = calculateAge(row.birthDate);
    const isCalled = row.status === 'called';
    const isUndoing = pendingUndoId === row.id;
    const printStatus = getStatus(row.id, row.tt25_data);

    return (
      <tr
        key={row.id}
        className={`dym-table-row ${isCalled ? 'row-called' : 'row-waiting'}`}
      >
        {/* Ticket Code */}
        <td className="col-ticket">
          <span className="dym-ticket-tag" data-parity={Number(row.queueNumber) % 2 === 0 ? 'even' : 'odd'}>
            <HighlightText text={row.queueNumber} query={resultQuery} />
          </span>
        </td>

        {/* Time */}
        <td className="col-time">
          <div className="dym-time-cell">
            <span>{row.registeredAt}</span>
          </div>
        </td>

        {/* Patient Name & Demographics */}
        <td className="col-patient">
          <div className="dym-patient-block">
            <strong className="dym-patient-name">
              <HighlightText text={row.fullName} query={resultQuery} />
            </strong>
            <div className="dym-patient-meta">
              <span className="dym-meta-gender">{row.gender}</span>
              {age !== null && (
                <span className="dym-meta-age">
                  {age} tuổi ({row.birthDate})
                </span>
              )}
            </div>
          </div>
        </td>

        {/* Contact Phone */}
        <td className="col-contact">
          <span className="dym-phone-text">
            <HighlightText text={formatPhone(row.phone)} query={resultQuery} />
          </span>
        </td>

        {/* Company / Corporate Health check */}
        <td className="col-company">
          {row.companyName && row.companyName !== '—' ? (
            <div className="dym-company-pill" title={row.companyName}>
              <span className="truncate">{row.companyName}</span>
            </div>
          ) : (
            <span className="text-slate-300 font-light">—</span>
          )}
        </td>

        {/* Status Badge */}
        <td className="col-status">
          <span
            className={`dym-status-badge ${
              isCalled ? 'badge-called' : 'badge-waiting'
            }`}
          >
            <span className="dym-status-indicator-dot" />
            {STATUS_META[row.status].label}
          </span>
        </td>

        {/* Print Status Badge */}
        <td className="col-print-status">
          <span
            title={printStatus.title}
            className={`dym-status-badge ${printStatus.cls}`}
          >
            <span className="dym-status-indicator-dot" />
            {printStatus.label}
          </span>
        </td>

        {/* Actions */}
        <td className="col-actions text-right">
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              className="dym-btn-table-action"
              aria-label={`In phiếu Đồng thuận cho ${row.fullName}`}
              title="In phiếu Đồng thuận khám sức khỏe"
              disabled={loadingPrintId === `consent:${row.id}`}
              onClick={() => void handlePrintConsentClick(row)}
            >
              <span>
                {loadingPrintId === `consent:${row.id}` ? 'Đang nạp...' : 'In Đồng thuận'}
              </span>
            </button>

            <button
              type="button"
              className="dym-btn-table-action"
              aria-label={`In phiếu khám TT25 cho ${row.fullName}`}
              title="In phiếu khám sức khỏe TT25"
              disabled={loadingPrintId === `tt25:${row.id}`}
              onClick={() => void handlePrintClick(row)}
            >
              <span>
                {loadingPrintId === `tt25:${row.id}` ? 'Đang nạp...' : 'In TT25'}
              </span>
            </button>

            {isCalled && date === today && (
              <button
                type="button"
                className="dym-btn-undo"
                aria-label={`Đưa số ${row.queueNumber} của ${row.fullName} về hàng chờ`}
                disabled={isMutating}
                data-loading={isUndoing}
                onClick={() => onReturnToWaiting(row)}
              >
                <ArrowUturnLeftIcon
                  className={`w-3.5 h-3.5 ${isUndoing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{isUndoing ? 'Đang hoàn tác...' : 'Đưa về chờ'}</span>
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }), [date, displayedRows, getStatus, handlePrintClick, handlePrintConsentClick, isMutating, loadingPrintId, onReturnToWaiting, pendingUndoId, resultQuery, today]);

  return (
    <section className="dym-registry-panel" aria-labelledby="registry-ledger-title">
      {printError && <Alert variant="destructive"><AlertDescription>{printError}</AlertDescription></Alert>}
      {hasIdentitySearchError && (
        <Alert variant="warning"><AlertDescription>Chưa tải được dữ liệu để tìm theo CCCD hoặc hộ chiếu.</AlertDescription></Alert>
      )}
      {/* Top Toolbar */}
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
        <div className="dym-registry-title-block">
          <h2 id="registry-ledger-title" className="dym-registry-title">
            Danh sách khám tại {branchName}
          </h2>
        </div>

        {/* Quick Filter Tabs & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Quick Filter Tabs (shadcn Tabs + Badge) */}
          <Tabs
            value={statusFilter}
            onValueChange={(value) => onStatusFilterChange(value as TableStatusFilter)}
          >
            <TabsList
              aria-label="Lọc theo trạng thái"
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

          {/* Search Box (shadcn Input + Clear Button / Kbd) */}
          <SearchField
                id={searchInputId}
                placeholder={canSearchIdentity ? 'Tìm số phiếu, tên, SĐT, CCCD/hộ chiếu…' : 'Tìm số phiếu, tên, SĐT…'}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                aria-label="Tìm kiếm lượt đăng ký"
                onClear={() => onQueryChange('')}
                shortcut
              />
        </div>
      </div>

      {/* Main Table Content */}
      {isDataLoading ? (
        <div
          className="dym-table-scroller"
          aria-busy="true"
          aria-live="polite"
          aria-label="Đang tải danh sách tiếp nhận"
        >
          <table className="dym-table-precision">
            <thead>
              <tr>
                <th scope="col" className="col-ticket">MÃ SỐ</th>
                <th scope="col" className="col-time">GIỜ VÀO</th>
                <th scope="col" className="col-patient">TÊN KHÁCH HÀNG</th>
                <th scope="col" className="col-contact">SĐT</th>
                <th scope="col" className="col-company">CÔNG TY</th>
                <th scope="col" className="col-status">TRẠNG THÁI</th>
                <th scope="col" className="col-print-status">TRẠNG THÁI IN</th>
                <th scope="col" className="col-actions text-right">THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="dym-table-row">
                  <td className="col-ticket">
                    <Skeleton className="h-6 w-14 rounded-md" />
                  </td>
                  <td className="col-time">
                    <Skeleton className="h-4 w-12" />
                  </td>
                  <td className="col-patient">
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </td>
                  <td className="col-contact">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="col-company">
                    <Skeleton className="h-5 w-40 rounded-md" />
                  </td>
                  <td className="col-status">
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </td>
                  <td className="col-print-status">
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </td>
                  <td className="col-actions text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Skeleton className="h-7 w-24 rounded-md" />
                      <Skeleton className="h-7 w-16 rounded-md" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : displayedRows.length === 0 ? (
        <div className="dym-table-empty-box" role="status">
          <h3 className="dym-empty-title">
            {query
              ? 'Không tìm thấy kết quả phù hợp'
              : statusFilter !== 'all'
                ? statusFilter === 'called' ? 'Chưa có khách đã gọi' : 'Không có khách đang chờ'
                : 'Chưa có khách đăng ký trong ngày này'}
          </h3>
          <p className="dym-empty-desc">
            {query
              ? 'Kiểm tra từ khóa hoặc đặt lại bộ lọc.'
              : statusFilter !== 'all'
                ? 'Chọn Tất cả để xem lại danh sách khách hàng trong ngày.'
                : 'Khách đăng ký tại quầy hoặc qua mã QR sẽ xuất hiện tại đây.'}
          </p>
          {(query || statusFilter !== 'all') && (
            <button
              type="button"
              className="dym-btn-reset-filter"
              onClick={() => {
                onQueryChange('');
                onStatusFilterChange('all');
              }}
            >
              Đặt lại bộ lọc
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="dym-table-scroller">
            <table className="dym-table-precision">
              <thead>
                <tr>
                  <th scope="col" className="col-ticket">Mã số</th>
                  <th scope="col" className="col-time">Giờ vào</th>
                  <th scope="col" className="col-patient">Tên khách hàng</th>
                  <th scope="col" className="col-contact">SĐT</th>
                  <th scope="col" className="col-company">Công ty</th>
                  <th scope="col" className="col-status">Trạng thái</th>
                  <th scope="col" className="col-print-status">Trạng thái in</th>
                  <th scope="col" className="col-actions text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {tableRows}
              </tbody>
            </table>
          </div>

          <div className="dym-pagination-bar">
            <div className="dym-pagination-summary">
              <strong className="font-semibold text-foreground">{displayedRows.length}</strong> lượt khám
            </div>
          </div>
        </>
      )}

      {/* TT25 Print Preview Modal */}
      {printModalData && (
        <Suspense fallback={null}>
          <TT25PrintModal
            isOpen={Boolean(printModalData)}
            onClose={() => setPrintModalData(null)}
            data={printModalData}
            key={activePrintRowId}
            onPrinted={async () => {
              if (activePrintRowId) {
                await markPrinted(activePrintRowId, 'tt25');
              }
            }}
          />
        </Suspense>
      )}

      {/* Consent Print Preview Modal */}
      {consentModalData && (
        <Suspense fallback={null}>
          <ConsentPrintModal
            isOpen={Boolean(consentModalData)}
            onClose={() => setConsentModalData(null)}
            data={consentModalData}
            key={activePrintRowId}
            onPrinted={async () => {
              if (activePrintRowId) {
                await markPrinted(activePrintRowId, 'consent');
              }
            }}
          />
        </Suspense>
      )}
    </section>
  );
}
