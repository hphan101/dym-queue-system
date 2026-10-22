import { lazy, Suspense, useId, useMemo, useState } from 'react';
import {
  ArrowUturnLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { BranchCode } from '../../../types/domain';
import { STATUS_META, type QueueStatus } from '../constants/queueConstants';
import { usePrintStatus } from '../hooks/usePrintStatus';
import { useRegistrationOverrides } from '../hooks/useRegistrationOverrides';
import { calculateAge, formatBirthDate, formatPhone } from '../utils/adminFormatters';
import { supabase } from '../../../lib/supabaseClient';
import type { RegistrationDetails } from '../hooks/useRegistrationDetailsQuery';
import type { TT25StoredExtras } from '../types';
import {
  type TT25RegistrationData,
  createDefaultTT25Data,
  getDefaultTargetPaymentByReason,
} from '../../registration/tt25Types';
import { HighlightText } from './HighlightText';

const TT25PrintModal = lazy(() => import('../../registration/TT25PrintModal'));
const ConsentPrintModal = lazy(
  () => import('../../registration/ConsentPrintModal'),
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
  filteredRows: RegistrationRow[];
  paginatedRows: RegistrationRow[];
  query: string;
  onQueryChange: (query: string) => void;
  isDataLoading: boolean;
  isMutating: boolean;
  pendingUndoId: string | null;
  branchName: string;
  date: string;
  today: string;
  visiblePage: number;
  totalPages: number;
  firstVisibleRow: number;
  lastVisibleRow: number;
  onPageChange: (page: number) => void;
  onReturnToWaiting: (row: RegistrationRow) => void;
}

type TableStatusFilter = 'all' | 'waiting' | 'called';

export function QueueTable({
  filteredRows,
  paginatedRows,
  query,
  onQueryChange,
  isDataLoading,
  isMutating,
  pendingUndoId,
  branchName,
  date,
  today,
  visiblePage,
  totalPages,
  firstVisibleRow,
  lastVisibleRow,
  onPageChange,
  onReturnToWaiting,
}: QueueTableProps) {
  const searchInputId = useId();
  const [statusFilter, setStatusFilter] = useState<TableStatusFilter>('all');
  const [printModalData, setPrintModalData] = useState<TT25RegistrationData | null>(null);
  const [consentModalData, setConsentModalData] = useState<TT25RegistrationData | null>(null);
  const [activePrintRowId, setActivePrintRowId] = useState<string | null>(null);
  const [loadingPrintId, setLoadingPrintId] = useState<string | null>(null);
  const { getStatus, markPrinted, togglePrintStatus } = usePrintStatus();
  const { overrideMap, applyToDetails } = useRegistrationOverrides();

  const createPrintDataFromRow = (
    row: RegistrationRow,
    details?: RegistrationDetails | null,
  ): TT25RegistrationData => {
    const mergedDetails = details ? applyToDetails(details) : null;
    const ov = overrideMap[row.id];
    const extras = {
      ...(mergedDetails?.tt25_data ?? {}),
      ...(ov?.tt25_data ?? {}),
    };

    const workplaceVal =
      ov?.company_name !== undefined
        ? ov.company_name
        : mergedDetails?.company_name && mergedDetails.company_name !== '—'
          ? mergedDetails.company_name
          : row.companyName !== '—'
            ? row.companyName
            : '';

    const parsedBirthDate =
      ov?.birth_date ||
      mergedDetails?.birth_date ||
      (row.birthDate.includes('/')
        ? row.birthDate.split('/').reverse().join('-')
        : row.birthDate);

    const defaultReason = workplaceVal.trim()
      ? 'Khám sức khỏe định kỳ theo công ty'
      : 'Khám sức khỏe cá nhân tự nguyện';
    const resolvedReason =
      extras.checkupReason && extras.checkupReason !== 'Khám sức khỏe tổng quát'
        ? extras.checkupReason
        : defaultReason;

    const wpWard = extras.workplaceWard || '';
    const wpProv = extras.workplaceProvince || '';
    const resolvedWorkplaceWard =
      wpProv && !wpWard.includes(wpProv)
        ? [wpWard, wpProv].filter(Boolean).join(', ')
        : wpWard;

    return createDefaultTT25Data({
      branch: row.branch,
      fullName: ov?.full_name || mergedDetails?.full_name || row.fullName,
      gender: ((ov?.gender || mergedDetails?.gender || row.gender) as 'Nam' | 'Nữ') || 'Nam',
      birthDate: parsedBirthDate,
      ethnicity: extras.ethnicity || 'Kinh',
      bloodGroup: extras.bloodGroup || 'Chưa rõ',
      cccd: ov?.identity_document ?? mergedDetails?.identity_document ?? '',
      insuranceNumber: extras.insuranceNumber || '',
      province: ov?.province ?? mergedDetails?.province ?? '',
      ward: ov?.ward ?? mergedDetails?.ward ?? '',
      addressDetail: ov?.address_detail ?? mergedDetails?.address_detail ?? '',
      occupation: extras.occupation || '',
      workplace: workplaceVal,
      workplaceWard: resolvedWorkplaceWard,
      phoneNumber:
        ov?.phone_number ||
        mergedDetails?.phone_number ||
        (row.phone !== '—' ? row.phone : ''),
      checkupReason: resolvedReason,
      medicalHistory: extras.medicalHistory,
      targetPayment:
        extras.targetPayment ?? getDefaultTargetPaymentByReason(resolvedReason),
      consentAgreed: extras.consentAgreed ?? true,
      queueNumber: row.queueNumber,
      checkupDate: mergedDetails?.queue_date || row.date,
    });
  };

  const fetchRowPrintData = async (row: RegistrationRow): Promise<TT25RegistrationData> => {
    try {
      const { data: detailsList, error } = await supabase.rpc(
        'get_registration_details',
        {
          p_branch_code: row.branch,
          p_queue_date: row.date,
        },
      );

      if (error) {
        console.warn('Could not fetch registration details via RPC:', error);
      }

      const match = (detailsList as RegistrationDetails[] | null)?.find(
        (r) => r.id === row.id,
      );

      return createPrintDataFromRow(row, match);
    } catch (err) {
      console.error('Error getting print details:', err);
      return createPrintDataFromRow(row, null);
    }
  };

  const handlePrintClick = async (row: RegistrationRow) => {
    setLoadingPrintId(`tt25:${row.id}`);
    try {
      const data = await fetchRowPrintData(row);
      setActivePrintRowId(row.id);
      markPrinted(row.id, 'tt25');
      setPrintModalData(data);
    } finally {
      setLoadingPrintId(null);
    }
  };

  const handlePrintConsentClick = async (row: RegistrationRow) => {
    setLoadingPrintId(`consent:${row.id}`);
    try {
      const data = await fetchRowPrintData(row);
      setActivePrintRowId(row.id);
      markPrinted(row.id, 'consent');
      setConsentModalData(data);
    } finally {
      setLoadingPrintId(null);
    }
  };

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

  // Apply tab filter on rows
  const displayedRows = useMemo(() => {
    const baseRows =
      statusFilter === 'all'
        ? paginatedRows
        : paginatedRows.filter((r) => r.status === statusFilter);
    return baseRows.map((r) => {
      const ov = overrideMap[r.id];
      if (!ov) return r;
      return {
        ...r,
        fullName: ov.full_name || r.fullName,
        gender: ov.gender || r.gender,
        birthDate: ov.birth_date ? formatBirthDate(ov.birth_date) : r.birthDate,
        phone: ov.phone_number || r.phone,
        companyName: ov.company_name || '—',
      };
    });
  }, [overrideMap, paginatedRows, statusFilter]);

  return (
    <section className="dym-registry-panel" aria-labelledby="registry-ledger-title">
      {/* Top Toolbar */}
      <div className="dym-registry-toolbar">
        <div className="dym-registry-title-block">
          <span className="dym-registry-kicker">DANH SÁCH TIẾP NHẬN</span>
          <h2 id="registry-ledger-title" className="dym-registry-heading">
            Danh sách khám tại {branchName}
          </h2>
          <p className="dym-registry-desc">
            Theo dõi thời gian đăng ký, thông tin định danh và trạng thái điều phối từng lượt.
          </p>
        </div>

        {/* Quick Filter Tabs & Search Bar */}
        <div className="dym-registry-controls">
          {/* Status Quick Filter Tabs */}
          <div className="dym-tab-group" role="tablist" aria-label="Lọc theo trạng thái">
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'all'}
              className={`dym-tab-btn ${statusFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              <span>Tất cả</span>
              <span className="dym-tab-badge">{tabCounts.all}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'waiting'}
              className={`dym-tab-btn is-waiting ${statusFilter === 'waiting' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter('waiting')}
            >
              <span className="dym-tab-dot-waiting" />
              <span>Chờ gọi</span>
              <span className="dym-tab-badge">{tabCounts.waiting}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'called'}
              className={`dym-tab-btn is-called ${statusFilter === 'called' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter('called')}
            >
              <span className="dym-tab-dot-called" />
              <span>Đã gọi</span>
              <span className="dym-tab-badge">{tabCounts.called}</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="dym-search-wrapper">
            <label htmlFor={searchInputId} className="sr-only">
              Tìm kiếm lượt đăng ký
            </label>
            <div className="dym-search-input-box">
              <MagnifyingGlassIcon className="dym-search-icon" aria-hidden="true" />
              <input
                id={searchInputId}
                type="search"
                className="dym-search-field"
                placeholder="Tìm tên, SĐT, số thứ tự, công ty..."
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
              />
              {query ? (
                <button
                  type="button"
                  className="dym-search-clear-btn"
                  onClick={() => onQueryChange('')}
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              ) : (
                <kbd className="dym-search-shortcut" title="Phím tắt: /">
                  /
                </kbd>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      {isDataLoading ? (
        <div className="dym-table-empty-box" aria-live="polite">
          <div className="page-loader-dots" aria-hidden="true" />
          <h3 className="dym-empty-title">Đang đồng bộ danh sách tiếp nhận</h3>
          <p className="dym-empty-desc">Dữ liệu hàng chờ được tải trực tiếp từ máy chủ Supabase.</p>
        </div>
      ) : displayedRows.length === 0 ? (
        <div className="dym-table-empty-box">
          <div className="dym-empty-icon-wrap">
            <UserGroupIcon className="w-8 h-8 text-slate-400" aria-hidden="true" />
          </div>
          <h3 className="dym-empty-title">
            {query
              ? 'Không tìm thấy kết quả phù hợp'
              : statusFilter !== 'all'
                ? `Không có lượt nào ở trạng thái "${STATUS_META[statusFilter as QueueStatus].label}"`
                : 'Chưa có lượt đăng ký nào trong ngày'}
          </h3>
          <p className="dym-empty-desc">
            {query
              ? 'Vui lòng kiểm tra lại họ tên, số điện thoại hoặc mã số thứ tự.'
              : 'Khách hàng quét mã QR tại phòng khám sẽ tự động hiển thị tại đây.'}
          </p>
          {(query || statusFilter !== 'all') && (
            <button
              type="button"
              className="dym-btn-reset-filter"
              onClick={() => {
                onQueryChange('');
                setStatusFilter('all');
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
                  <th scope="col" className="col-ticket">MÃ SỐ</th>
                  <th scope="col" className="col-time">GIỜ BỐC</th>
                  <th scope="col" className="col-patient">HỌ VÀ TÊN</th>
                  <th scope="col" className="col-contact">LIÊN HỆ</th>
                  <th scope="col" className="col-company">CƠ QUAN / ĐOÀN</th>
                  <th scope="col" className="col-status">TRẠNG THÁI</th>
                  <th scope="col" className="col-print-status">TRẠNG THÁI IN</th>
                  <th scope="col" className="col-actions text-right">THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((row) => {
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
                        <span className="dym-ticket-tag">
                          <HighlightText text={row.queueNumber} query={query} />
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
                            <HighlightText text={row.fullName} query={query} />
                          </strong>
                          <div className="dym-patient-meta">
                            <span className="dym-meta-gender">{row.gender}</span>
                            {age !== null && (
                              <span className="dym-meta-age">
                                {age} tuổi (
                                <HighlightText text={row.birthDate} query={query} />
                                )
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact Phone */}
                      <td className="col-contact">
                        <span className="dym-phone-text">
                          <HighlightText text={formatPhone(row.phone)} query={query} />
                        </span>
                      </td>

                      {/* Company / Corporate Health check */}
                      <td className="col-company">
                        {row.companyName && row.companyName !== '—' ? (
                          <div className="dym-company-pill" title={row.companyName}>
                            <span className="truncate">
                              <HighlightText text={row.companyName} query={query} />
                            </span>
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
                        <button
                          type="button"
                          onClick={() => togglePrintStatus(row.id, row.tt25_data)}
                          title={printStatus.title}
                          className={`dym-status-badge dym-print-status-btn ${printStatus.cls}`}
                        >
                          <span className="dym-status-indicator-dot" />
                          {printStatus.label}
                        </button>
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
                })}
              </tbody>
            </table>
          </div>

          {/* Table Pagination */}
          <nav
            className="dym-pagination-bar"
            aria-label="Phân trang danh sách tại bàn tiếp nhận"
          >
            <div className="dym-pagination-summary">
              Hiển thị <span className="font-semibold text-slate-800">{firstVisibleRow}–{lastVisibleRow}</span> trong tổng số{' '}
              <span className="font-semibold text-slate-800">{filteredRows.length}</span> lượt khám
            </div>

            <div className="dym-pagination-pager">
              <button
                type="button"
                className="dym-page-btn"
                aria-label="Trang trước"
                disabled={visiblePage === 1}
                onClick={() => onPageChange(Math.max(1, visiblePage - 1))}
              >
                <ChevronLeftIcon className="w-4 h-4" />
                <span>Trước</span>
              </button>

              <span className="dym-page-indicator" aria-current="page">
                Trang <strong>{visiblePage}</strong> / {totalPages}
              </span>

              <button
                type="button"
                className="dym-page-btn"
                aria-label="Trang sau"
                disabled={visiblePage === totalPages}
                onClick={() => onPageChange(Math.min(totalPages, visiblePage + 1))}
              >
                <span>Sau</span>
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </nav>
        </>
      )}

      {/* TT25 Print Preview Modal */}
      {printModalData && (
        <Suspense fallback={null}>
          <TT25PrintModal
            isOpen={Boolean(printModalData)}
            onClose={() => setPrintModalData(null)}
            data={printModalData}
            onPrinted={() => {
              if (activePrintRowId) {
                markPrinted(activePrintRowId, 'tt25');
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
            onPrinted={() => {
              if (activePrintRowId) {
                markPrinted(activePrintRowId, 'consent');
              }
            }}
          />
        </Suspense>
      )}
    </section>
  );
}
