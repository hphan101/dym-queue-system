import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  EyeIcon,
  IdentificationIcon,
  MagnifyingGlassIcon,
  PrinterIcon,
  SignalSlashIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Theme } from '@astryxdesign/core/theme';
import '@astryxdesign/core/astryx.css';
import { useQueryClient } from '@tanstack/react-query';

import { TT25PrintModal } from '../registration/TT25PrintModal';

import { BRANCH_NAMES } from '../../config/branches';
import { getTodayInVietnam } from '../../lib/date';
import { formatQueueNumber } from '../../lib/queueNumber';
import { supabase } from '../../lib/supabaseClient';
import type { BranchCode } from '../../types/domain';
import { AdminSidebar } from './AdminSidebar';
import { clearRememberedStaffName } from './adminIdentity';
import { getCachedRegistrationCount } from './registrationCountCache';
import { dymAdminTheme } from './theme';
import './admin.css';
import './registrations.css';

import { useAdminTheme } from './hooks/useAdminTheme';
import { useSidebarResponsive } from './hooks/useSidebarResponsive';
import { useStaffIdentity } from './hooks/useStaffIdentity';
import { useRegistrationDetailsQuery } from './hooks/useRegistrationDetailsQuery';
import {
  formatFullAddress,
  formatRegistrationTime,
  normalizeSearch,
} from './utils/adminFormatters';
import { AdminHeader } from './components/AdminHeader';
import {
  CustomerNoticeModal,
  type CustomerNotificationItem,
} from './components/CustomerNoticeModal';

export interface RegistrationDetails {
  id: string;
  branch_id: string;
  queue_date: string;
  queue_number: number;
  registered_at: string;
  full_name: string;
  birth_date: string;
  gender: string;
  phone_number: string;
  identity_document: string;
  company_name: string;
  province: string;
  ward: string;
  address_detail: string;
  state: 'active' | 'completed' | 'cancelled';
  first_called_at: string | null;
  last_called_at: string | null;
}

type RealtimeConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'offline';

type RegistrationStatusTab = 'all' | 'waiting' | 'called';

const PAGE_SIZE = 15;
const NEW_REGISTRATION_NOTICE_MS = 8_000;

function formatBirthDate(value: string) {
  if (!value) return '—';
  const parts = value.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return value;
}

function calculateAge(birthDateStr: string): number | null {
  if (!birthDateStr) return null;
  const currentYear = new Date().getFullYear();
  if (birthDateStr.includes('-')) {
    const year = Number.parseInt(birthDateStr.split('-')[0] ?? '', 10);
    return Number.isNaN(year) ? null : currentYear - year;
  }
  const parts = birthDateStr.split('/');
  const year = Number.parseInt(parts[parts.length - 1] ?? '', 10);
  return Number.isNaN(year) ? null : currentYear - year;
}

function formatPhone(value: string) {
  if (!value) return '—';
  return value.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');
}

function getDisplayState(row: RegistrationDetails) {
  if (row.state === 'completed') {
    return { key: 'completed', label: 'Hoàn tất', cls: 'badge-called' };
  }
  if (row.state === 'cancelled') {
    return { key: 'cancelled', label: 'Đã hủy', cls: 'badge-cancelled' };
  }
  if (row.first_called_at) {
    return { key: 'called', label: 'Đã gọi', cls: 'badge-called' };
  }
  return { key: 'waiting', label: 'Chờ gọi', cls: 'badge-waiting' };
}

export function RegistrationsPage({
  authorizedIsAdmin,
}: {
  authorizedIsAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { themeMode, setThemeMode } = useAdminTheme();
  const { isSidebarCollapsed, setIsSidebarCollapsed } = useSidebarResponsive();
  const { staffName, branchIds, identityError } = useStaffIdentity();

  const [branch, setBranch] = useState<BranchCode>('q1');
  const [date, setDate] = useState(getTodayInVietnam);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RegistrationStatusTab>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<RegistrationDetails | null>(null);
  const [printModalRow, setPrintModalRow] = useState<RegistrationDetails | null>(null);
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>(
      navigator.onLine ? 'connecting' : 'offline',
    );
  const [newRegistrationNotice, setNewRegistrationNotice] =
    useState<CustomerNotificationItem | null>(null);

  const noticeTimer = useRef<number | null>(null);
  const searchInputId = useId();
  const branchId = branchIds[branch];

  const {
    data: fetchedRows,
    isLoading,
    error: queryError,
    refetch: refetchRegistrations,
  } = useRegistrationDetailsQuery({
    branch,
    branchId,
    date,
  });

  const rows = useMemo(() => fetchedRows ?? [], [fetchedRows]);
  const error = queryError ? 'Không thể tải danh sách đăng ký. Vui lòng thử lại.' : null;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `Danh Sách Tiếp Nhận | ${BRANCH_NAMES[branch]} - DYM Medical Center`;
    return () => {
      document.title = previousTitle;
    };
  }, [branch]);

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
  }, [searchInputId]);

  // Supabase Realtime subscription for incoming registrations
  useEffect(() => {
    if (!branchId) return;

    const channel = supabase
      .channel(`registrations-page:${branchId}:${date}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'registrations',
          filter: `branch_id=eq.${branchId}`,
        },
        (payload) => {
          if (
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

          void queryClient.invalidateQueries({
            queryKey: ['registrationDetails', branch, date],
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'registrations',
          filter: `branch_id=eq.${branchId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ['registrationDetails', branch, date],
          });
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

  const completionRate = useMemo(() => {
    if (tabCounts.all === 0) return 0;
    return Math.round((tabCounts.called / tabCounts.all) * 100);
  }, [tabCounts]);

  // Filter rows by search and status tab
  const filteredRows = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    return rows.filter((row) => {
      // Status tab match
      if (statusFilter === 'waiting') {
        if (row.first_called_at || row.state === 'completed' || row.state === 'cancelled') {
          return false;
        }
      } else if (statusFilter === 'called') {
        if (!row.first_called_at && row.state !== 'completed') {
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
        row.province,
        row.ward,
        row.address_detail,
      ].join(' ');

      return normalizeSearch(searchableText).includes(normalizedQuery);
    });
  }, [query, rows, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (visiblePage - 1) * PAGE_SIZE;
  const paginatedRows = useMemo(
    () => filteredRows.slice(pageStartIndex, pageStartIndex + PAGE_SIZE),
    [filteredRows, pageStartIndex],
  );
  const firstVisibleRow = filteredRows.length === 0 ? 0 : pageStartIndex + 1;
  const lastVisibleRow = Math.min(pageStartIndex + PAGE_SIZE, filteredRows.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [branch, date, query, statusFilter]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearRememberedStaffName();
    window.location.assign('/?page=login');
  };

  const availableBranches = Object.keys(BRANCH_NAMES) as BranchCode[];
  const registrationCount = getCachedRegistrationCount(branch, date) ?? rows.length;

  return (
    <Theme theme={dymAdminTheme} mode={themeMode}>
      <div className="dym-admin-shell" data-color-mode={themeMode}>
        <AdminSidebar
          activePage="registrations"
          branch={branch}
          registrationCount={registrationCount}
          staffName={staffName}
          isAdmin={authorizedIsAdmin}
          themeMode={themeMode}
          isCollapsed={isSidebarCollapsed}
          onCollapsedChange={setIsSidebarCollapsed}
          onThemeToggle={() =>
            setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))
          }
          onLogout={() => void handleLogout()}
        />

        <div className="dym-admin-workspace">
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
              <button
                type="button"
                className="dym-btn-action-secondary"
                aria-busy={isLoading}
                disabled={isLoading}
                onClick={() => void refetchRegistrations()}
                title="Làm mới danh sách dữ liệu (F5)"
              >
                <ArrowPathIcon
                  className={`w-4 h-4 shrink-0 ${isLoading ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{isLoading ? 'Đang tải...' : 'Làm mới'}</span>
              </button>
            }
          />

          <CustomerNoticeModal
            notification={newRegistrationNotice}
            onClose={() => setNewRegistrationNotice(null)}
          />

          <main className="dym-admin-content">
            {/* Connection alert if offline or error */}
            {connectionState !== 'connected' && (
              <div
                className="dym-connection-alert"
                data-state={connectionState}
                role="status"
                aria-live="polite"
              >
                <SignalSlashIcon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <div>
                  <strong>
                    {connectionState === 'offline'
                      ? 'Thiết bị đang mất Internet'
                      : connectionState === 'connecting'
                        ? 'Đang kết nối dữ liệu trực tiếp'
                        : 'Mất kết nối Supabase Realtime'}
                  </strong>
                  <span>
                    {connectionState === 'offline'
                      ? 'Dữ liệu sẽ tự đồng bộ lại khi có mạng.'
                      : 'Hệ thống đang tự thử kết nối lại, không cần tải lại trang.'}
                  </span>
                </div>
              </div>
            )}

            {(error || identityError) && (
              <div className="dym-data-error" role="alert">
                {error || identityError}
              </div>
            )}

            {/* Overview Summary Metrics Strip */}
            <section
              className="dym-metrics-summary-grid"
              aria-label="Thống kê danh sách tiếp nhận"
            >
              <div className="dym-metric-summary-card">
                <div className="dym-metric-summary-header">
                  <span className="dym-metric-summary-label">Tổng khách đăng ký</span>
                  <UserGroupIcon className="dym-metric-summary-icon" aria-hidden="true" />
                </div>
                <div className="dym-metric-summary-value-row">
                  <strong className="dym-metric-summary-number">
                    {tabCounts.all}
                  </strong>
                  <span className="dym-metric-summary-unit">bệnh nhân</span>
                </div>
                <div className="dym-metric-summary-footnote">
                  Toàn bộ hồ sơ trong ngày tại {BRANCH_NAMES[branch]}
                </div>
              </div>

              <div className="dym-metric-summary-card">
                <div className="dym-metric-summary-header">
                  <span className="dym-metric-summary-label">Đang chờ tiếp đón</span>
                  <ClockIcon className="dym-metric-summary-icon text-amber-500" aria-hidden="true" />
                </div>
                <div className="dym-metric-summary-value-row">
                  <strong className="dym-metric-summary-number text-amber-600 dark:text-amber-400">
                    {tabCounts.waiting}
                  </strong>
                  <span className="dym-metric-summary-unit">đang chờ</span>
                </div>
                <div className="dym-metric-summary-footnote">
                  Khách đang ngồi tại sảnh chưa gọi số
                </div>
              </div>

              <div className="dym-metric-summary-card">
                <div className="dym-metric-summary-header">
                  <span className="dym-metric-summary-label">Đã gọi / Hoàn tất</span>
                  <CheckCircleIcon className="dym-metric-summary-icon text-emerald-500" aria-hidden="true" />
                </div>
                <div className="dym-metric-summary-value-row">
                  <strong className="dym-metric-summary-number text-emerald-600 dark:text-emerald-400">
                    {tabCounts.called}
                  </strong>
                  <span className="dym-metric-summary-unit">lượt gọi</span>
                </div>
                <div className="dym-metric-summary-footnote">
                  Đã được bàn điều phối xử lý
                </div>
              </div>

              <div className="dym-metric-summary-card">
                <div className="dym-metric-summary-header">
                  <span className="dym-metric-summary-label">Tỷ lệ hoàn thành</span>
                  <ClipboardDocumentListIcon className="dym-metric-summary-icon text-sky-500" aria-hidden="true" />
                </div>
                <div className="dym-metric-summary-value-row">
                  <strong className="dym-metric-summary-number text-sky-600 dark:text-sky-400">
                    {completionRate}%
                  </strong>
                  <span className="dym-metric-summary-unit">tiến độ</span>
                </div>
                <div className="dym-metric-summary-footnote">
                  Tỷ lệ tiếp nhận đạt mục tiêu trong ngày
                </div>
              </div>
            </section>

            {/* Precision Table Section */}
            <section
              className="dym-registry-panel"
              aria-labelledby="registry-table-title"
            >
              {/* Toolbar with Tabs and Search */}
              <div className="dym-registry-toolbar">
                <div className="dym-registry-title-block">
                  <span className="dym-registry-kicker">HỒ SƠ KHÁM TIẾP NHẬN</span>
                  <h2 id="registry-table-title" className="dym-registry-title">
                    Danh Sách Chi Tiết Khách Hàng
                  </h2>
                  <p className="dym-registry-desc">
                    Tra cứu thông tin hành chính, bảo hiểm y tế và tiến độ tiếp đón bệnh nhân tại phòng khám.
                  </p>
                </div>

                {/* Filter Tabs & Search Controls */}
                <div className="dym-registry-controls">
                  {/* Filter Tabs */}
                  <div
                    className="dym-tab-group"
                    role="tablist"
                    aria-label="Lọc hồ sơ theo trạng thái"
                  >
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

                  {/* Search Field */}
                  <div className="dym-search-wrapper">
                    <label htmlFor={searchInputId} className="sr-only">
                      Tìm kiếm hồ sơ bệnh nhân
                    </label>
                    <div className="dym-search-input-box">
                      <MagnifyingGlassIcon className="dym-search-icon" aria-hidden="true" />
                      <input
                        id={searchInputId}
                        type="search"
                        className="dym-search-field"
                        placeholder="Tìm tên, SĐT, CCCD, công ty..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      {query ? (
                        <button
                          type="button"
                          className="dym-search-clear-btn"
                          onClick={() => setQuery('')}
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

              {/* Data Table Content */}
              {isLoading ? (
                <div className="dym-table-empty-box" aria-live="polite">
                  <div className="page-loader-dots" aria-hidden="true" />
                  <h3 className="dym-empty-title">Đang tải danh sách đăng ký</h3>
                  <p className="dym-empty-desc">
                    Hệ thống đang đồng bộ dữ liệu an toàn từ Supabase.
                  </p>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="dym-table-empty-box">
                  <div className="dym-empty-icon-wrap">
                    <UserGroupIcon className="w-7 h-7 text-sky-600" aria-hidden="true" />
                  </div>
                  <h3 className="dym-empty-title">Không tìm thấy hồ sơ đăng ký</h3>
                  <p className="dym-empty-desc">
                    Không có bệnh nhân nào phù hợp với bộ lọc hiện tại. Hãy thử đổi ngày, chi nhánh hoặc xóa từ khóa tìm kiếm.
                  </p>
                  {(query || statusFilter !== 'all') && (
                    <button
                      type="button"
                      className="dym-btn-reset-filter"
                      onClick={() => {
                        setQuery('');
                        setStatusFilter('all');
                      }}
                    >
                      Đặt lại bộ lọc
                    </button>
                  )}
                </div>
              ) : (
                <div className="dym-table-scroller">
                  <table className="dym-table-precision">
                    <thead>
                      <tr>
                        <th scope="col">Số Phiếu & Giờ</th>
                        <th scope="col">Bệnh Nhân</th>
                        <th scope="col">Liên Hệ & Định Danh</th>
                        <th scope="col">Đơn Vị & Địa Chỉ</th>
                        <th scope="col">Trạng Thái</th>
                        <th scope="col" className="text-right">Hồ Sơ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row) => {
                        const displayState = getDisplayState(row);
                        const age = calculateAge(row.birth_date);

                        return (
                          <tr key={row.id}>
                            {/* Ticket & Time */}
                            <td className="col-ticket">
                              <div className="flex flex-col gap-1 items-start">
                                <span className="dym-ticket-tag">
                                  {formatQueueNumber(row.queue_number)}
                                </span>
                                <div className="dym-time-cell">
                                  <span>{formatRegistrationTime(row.registered_at)}</span>
                                </div>
                              </div>
                            </td>

                            {/* Patient Info */}
                            <td>
                              <div className="dym-patient-block">
                                <div className="flex items-center gap-2">
                                  <strong className="dym-patient-name uppercase tracking-tight">
                                    {row.full_name}
                                  </strong>
                                  <span
                                    className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                                      row.gender === 'Nữ'
                                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                        : 'bg-sky-100 text-sky-700 border border-sky-200'
                                    }`}
                                  >
                                    {row.gender}
                                  </span>
                                </div>
                                <div className="dym-patient-meta">
                                  {age !== null && <span>{age} tuổi</span>}
                                  {row.birth_date && <span>({formatBirthDate(row.birth_date)})</span>}
                                </div>
                              </div>
                            </td>

                            {/* Contact & ID */}
                            <td>
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-xs text-slate-900 tabular-nums">
                                  {formatPhone(row.phone_number)}
                                </span>
                                <span className="text-xs text-slate-600 tabular-nums">
                                  {row.identity_document || '—'}
                                </span>
                              </div>
                            </td>

                            {/* Company & Location */}
                            <td>
                              <div className="flex flex-col gap-0.5 max-w-[280px]">
                                {row.company_name &&
                                row.company_name !== '—' &&
                                row.company_name !== 'Khách vãng lai' && (
                                  <span
                                    className="text-xs font-semibold text-slate-900 truncate"
                                    title={row.company_name}
                                  >
                                    {row.company_name}
                                  </span>
                                )}
                                <span
                                  className="text-[11px] text-slate-700 leading-snug line-clamp-2"
                                  title={formatFullAddress(row.address_detail, row.ward, row.province)}
                                >
                                  {formatFullAddress(row.address_detail, row.ward, row.province)}
                                </span>
                              </div>
                            </td>

                            {/* Status */}
                            <td>
                              <span className={`dym-status-badge ${displayState.cls}`}>
                                <span className="dym-status-indicator-dot" />
                                {displayState.label}
                              </span>
                            </td>

                            {/* Action Button */}
                            <td className="text-right">
                              <div className="dym-table-actions-group">
                                <button
                                  type="button"
                                  className="dym-btn-table-action action-view"
                                  onClick={() => setSelectedRow(row)}
                                  title="Xem hồ sơ chi tiết"
                                >
                                  <EyeIcon className="w-3.5 h-3.5 text-sky-600" aria-hidden="true" />
                                  <span>Chi tiết</span>
                                </button>
                                <button
                                  type="button"
                                  className="dym-btn-table-action"
                                  onClick={() => setPrintModalRow(row)}
                                  title="In phiếu khám sức khỏe TT25"
                                >
                                  <PrinterIcon className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                                  <span>In TT25</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination Bar */}
              {!isLoading && filteredRows.length > 0 && (
                <div className="dym-pagination-bar">
                  <span className="dym-pagination-summary">
                    Hiển thị <strong>{firstVisibleRow}</strong>–<strong>{lastVisibleRow}</strong> trong <strong>{filteredRows.length}</strong> đăng ký
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
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
            {selectedRow && (
              <div
                className="dym-clinical-drawer-backdrop"
                onClick={() => setSelectedRow(null)}
                role="dialog"
                aria-modal="true"
                aria-labelledby="drawer-patient-name"
              >
                <div
                  className="dym-clinical-drawer-panel"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Drawer Header */}
                  <div className="dym-clinical-drawer-header">
                    <div className="dym-clinical-drawer-title-wrap">
                      <span className="dym-clinical-drawer-kicker">
                        PHIẾU ĐĂNG KÝ TIẾP ĐÓN
                      </span>
                      <h2
                        id="drawer-patient-name"
                        className="dym-clinical-drawer-title flex items-center gap-2.5"
                      >
                        <span>{selectedRow.full_name}</span>
                        <span className="dym-ticket-number text-xs">
                          {formatQueueNumber(selectedRow.queue_number)}
                        </span>
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPrintModalRow(selectedRow)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-dym-blue-500 hover:bg-dym-blue-600 active:scale-95 text-white font-semibold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
                        title="In phiếu khám sức khỏe theo mẫu Thông tư 25"
                      >
                        <PrinterIcon className="w-4 h-4" />
                        <span>In phiếu TT25</span>
                      </button>
                      <button
                        type="button"
                        className="dym-clinical-drawer-close-btn"
                        onClick={() => setSelectedRow(null)}
                        aria-label="Đóng bảng chi tiết"
                      >
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Drawer Body */}
                  <div className="dym-clinical-drawer-body">
                    {/* Section 1: Thông tin cá nhân */}
                    <div className="dym-detail-section">
                      <div className="dym-detail-section-title">
                        <IdentificationIcon className="w-4 h-4" />
                        <span>Thông tin cá nhân</span>
                      </div>
                      <div className="dym-detail-grid">
                        <div className="dym-detail-item">
                          <span className="dym-detail-label">Họ và tên</span>
                          <span className="dym-detail-value">{selectedRow.full_name}</span>
                        </div>
                        <div className="dym-detail-item">
                          <span className="dym-detail-label">Giới tính</span>
                          <span className="dym-detail-value">{selectedRow.gender}</span>
                        </div>
                        <div className="dym-detail-item">
                          <span className="dym-detail-label">Ngày sinh</span>
                          <span className="dym-detail-value">
                            {formatBirthDate(selectedRow.birth_date)}
                            {calculateAge(selectedRow.birth_date) !== null && (
                              <span className="text-xs font-normal text-slate-500 ml-1">
                                ({calculateAge(selectedRow.birth_date)} tuổi)
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="dym-detail-item">
                          <span className="dym-detail-label">Số điện thoại</span>
                          <span className="dym-detail-value">{formatPhone(selectedRow.phone_number)}</span>
                        </div>
                        <div className="dym-detail-item dym-detail-full-width">
                          <span className="dym-detail-label">CCCD / Hộ chiếu</span>
                          <span className="dym-detail-value tabular-nums">
                            {selectedRow.identity_document || '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Đơn vị & Địa chỉ */}
                    <div className="dym-detail-section">
                      <div className="dym-detail-section-title">
                        <UserGroupIcon className="w-4 h-4" />
                        <span>Đơn vị & Nơi cư trú</span>
                      </div>
                      <div className="dym-detail-grid">
                        <div className="dym-detail-item dym-detail-full-width">
                          <span className="dym-detail-label">Tên cơ quan / Công ty</span>
                          <span className="dym-detail-value">{selectedRow.company_name || 'Khách cá nhân / Vãng lai'}</span>
                        </div>
                        <div className="dym-detail-item">
                          <span className="dym-detail-label">Tỉnh / Thành phố</span>
                          <span className="dym-detail-value">{selectedRow.province || '—'}</span>
                        </div>
                        <div className="dym-detail-item">
                          <span className="dym-detail-label">Phường / Xã</span>
                          <span className="dym-detail-value">{selectedRow.ward || '—'}</span>
                        </div>
                        <div className="dym-detail-item dym-detail-full-width">
                          <span className="dym-detail-label">Địa chỉ chi tiết</span>
                          <span className="dym-detail-value">{selectedRow.address_detail || '—'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Quản lý lượt gọi */}
                    <div className="dym-detail-section">
                      <div className="dym-detail-section-title">
                        <ClockIcon className="w-4 h-4" />
                        <span>Nhật ký hàng đợi</span>
                      </div>
                      <div className="dym-detail-grid">
                        <div className="dym-detail-item">
                          <span className="dym-detail-label">Cơ sở tiếp nhận</span>
                          <span className="dym-detail-value">{BRANCH_NAMES[branch]}</span>
                        </div>
                        <div className="dym-detail-item">
                          <span className="dym-detail-label">Thời gian lấy số</span>
                          <span className="dym-detail-value tabular-nums">
                            {formatRegistrationTime(selectedRow.registered_at)} ({selectedRow.queue_date})
                          </span>
                        </div>
                        <div className="dym-detail-item">
                          <span className="dym-detail-label">Lần gọi đầu</span>
                          <span className="dym-detail-value tabular-nums">
                            {selectedRow.first_called_at
                              ? formatRegistrationTime(selectedRow.first_called_at)
                              : 'Chưa gọi'}
                          </span>
                        </div>
                        <div className="dym-detail-item">
                          <span className="dym-detail-label">Trạng thái</span>
                          <span className="dym-detail-value">
                            <span className={`dym-status-badge ${getDisplayState(selectedRow).cls}`}>
                              <span className="dym-badge-dot" />
                              {getDisplayState(selectedRow).label}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TT25 Print Preview Modal */}
            {printModalRow && (
              <TT25PrintModal
                isOpen={Boolean(printModalRow)}
                onClose={() => setPrintModalRow(null)}
                data={{
                  branch: branch,
                  fullName: printModalRow.full_name,
                  gender: (printModalRow.gender as 'Nam' | 'Nữ') || 'Nam',
                  birthDate: printModalRow.birth_date,
                  ethnicity: 'Kinh',
                  bloodGroup: 'Chưa rõ',
                  cccd: printModalRow.identity_document,
                  insuranceNumber: '',
                  province: printModalRow.province,
                  ward: printModalRow.ward,
                  addressDetail: printModalRow.address_detail,
                  occupation: '',
                  workplace: printModalRow.company_name || '',
                  workplaceWard: '',
                  phoneNumber: printModalRow.phone_number,
                  checkupReason: 'Khám sức khỏe tổng quát',
                  medicalHistory: {
                    familyHistory: { hasDisease: false, diseaseDetails: '' },
                    personalHistory: {},
                    personalOtherDetails: '',
                    currentTreatment: { isTreating: false, medications: '' },
                    pregnancyHistory: { hasHistory: false, details: '' },
                    commitmentAgreed: true,
                  },
                }}
                registrationNumber={formatQueueNumber(printModalRow.queue_number)}
              />
            )}

            <footer className="dym-admin-footer">
              <span>© 2026 DYM Medical Center — Hệ thống điều phối phòng khám</span>
            </footer>
          </main>
        </div>
      </div>
    </Theme>
  );
}

export default RegistrationsPage;
