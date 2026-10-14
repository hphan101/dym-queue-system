import {
  ArrowPathIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  SignalSlashIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { Badge } from '@astryxdesign/core/Badge';
import { Theme } from '@astryxdesign/core/theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@astryxdesign/core/astryx.css';
import { BRANCH_NAMES } from '../../config/branches';
import { getTodayInVietnam } from '../../lib/date';
import { formatQueueNumber } from '../../lib/queueNumber';
import { supabase } from '../../lib/supabaseClient';
import type { BranchCode } from '../../types/domain';
import { AdminSidebar } from './AdminSidebar';
import { clearRememberedStaffName } from './adminIdentity';
import {
  getCachedRegistrationCount,
  rememberRegistrationCount,
} from './registrationCountCache';
import { dymAdminTheme } from './theme';
import './admin.css';
import './registrations.css';

import { useAdminTheme } from './hooks/useAdminTheme';
import { useSidebarResponsive } from './hooks/useSidebarResponsive';
import { useStaffIdentity } from './hooks/useStaffIdentity';
import {
  formatRegistrationTime,
  normalizeSearch,
} from './utils/adminFormatters';
import {
  CustomerNoticeModal,
  type CustomerNotificationItem,
} from './components/CustomerNoticeModal';

interface RegistrationDetails {
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

const PAGE_SIZE = 20;
const NEW_REGISTRATION_NOTICE_MS = 8_000;

function formatBirthDate(value: string) {
  const [year, month, day] = value.split('-');
  return day && month && year ? `${day}/${month}/${year}` : value;
}

function formatPhone(value: string) {
  return value.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');
}

function getDisplayState(row: RegistrationDetails) {
  if (row.state === 'completed') {
    return { key: 'completed', label: 'Hoàn tất' };
  }
  if (row.state === 'cancelled') {
    return { key: 'cancelled', label: 'Đã hủy' };
  }
  if (row.first_called_at) {
    return { key: 'called', label: 'Đã gọi' };
  }
  return { key: 'waiting', label: 'Chờ gọi' };
}

export function RegistrationsPage({
  authorizedIsAdmin,
}: {
  authorizedIsAdmin: boolean;
}) {
  const { themeMode, setThemeMode } = useAdminTheme();
  const { isSidebarCollapsed, setIsSidebarCollapsed } = useSidebarResponsive();
  const { staffName, branchIds, identityError } = useStaffIdentity();

  const [branch, setBranch] = useState<BranchCode>('q1');
  const [date, setDate] = useState(getTodayInVietnam);
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rows, setRows] = useState<RegistrationDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>(
      navigator.onLine ? 'connecting' : 'offline',
    );
  const [newRegistrationNotice, setNewRegistrationNotice] =
    useState<CustomerNotificationItem | null>(null);

  const realtimeRefreshTimer = useRef<number | null>(null);
  const realtimeRetryTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const branchId = branchIds[branch];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Danh sách đăng ký | DYM Medical Center';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const availableBranches = useMemo(
    () => Object.keys(branchIds) as BranchCode[],
    [branchIds],
  );

  useEffect(() => {
    if (availableBranches.length > 0 && !branchIds[branch]) {
      setBranch(availableBranches[0]);
    }
  }, [availableBranches, branchIds, branch]);

  const loadRegistrations = useCallback(async (showLoading = true) => {
    if (!branchId) return;

    if (showLoading) setIsLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase.rpc(
      'get_registration_details',
      {
        p_branch_code: branch,
        p_queue_date: date,
      },
    );

    if (queryError) {
      console.error('Không thể tải chi tiết đăng ký:', queryError);
      setError('Không thể tải danh sách đăng ký. Vui lòng thử lại.');
      setIsLoading(false);
      return;
    }

    const fetchedRows = (data ?? []) as RegistrationDetails[];
    setRows(fetchedRows);
    rememberRegistrationCount(branch, date, fetchedRows.length);
    setIsLoading(false);
  }, [branch, branchId, date]);

  useEffect(() => {
    if (branchId) {
      void loadRegistrations();
    }
  }, [branchId, loadRegistrations]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimer.current !== null) {
      window.clearTimeout(realtimeRefreshTimer.current);
    }

    realtimeRefreshTimer.current = window.setTimeout(() => {
      realtimeRefreshTimer.current = null;
      void loadRegistrations(false);
    }, 200);
  }, [loadRegistrations]);

  useEffect(() => {
    const handleOffline = () => setConnectionState('offline');
    const handleOnline = () => {
      setConnectionState('connecting');
      void loadRegistrations(false);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [loadRegistrations]);

  useEffect(() => {
    if (!branchId) return;
    let isCurrentChannel = true;
    setConnectionState(navigator.onLine ? 'connecting' : 'offline');

    const channel = supabase
      .channel(`registrations-page:${branchId}:${date}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'registrations',
          filter: `branch_id=eq.${branchId}`,
        },
        (payload) => {
          if (
            payload.eventType === 'INSERT' &&
            String(payload.new.queue_date ?? '') === date &&
            payload.new.id &&
            payload.new.queue_number &&
            payload.new.full_name
          ) {
            if (noticeTimer.current !== null) {
              window.clearTimeout(noticeTimer.current);
            }
            setNewRegistrationNotice({
              id: String(payload.new.id),
              queueNumber: formatQueueNumber(Number(payload.new.queue_number)),
              fullName: String(payload.new.full_name),
            });
            noticeTimer.current = window.setTimeout(() => {
              noticeTimer.current = null;
              setNewRegistrationNotice(null);
            }, NEW_REGISTRATION_NOTICE_MS);
          }
          scheduleRealtimeRefresh();
        },
      )
      .subscribe((status) => {
        if (!isCurrentChannel) return;
        if (status === 'SUBSCRIBED') {
          setConnectionState('connected');
          if (realtimeRetryTimer.current !== null) {
            window.clearTimeout(realtimeRetryTimer.current);
            realtimeRetryTimer.current = null;
          }
          return;
        }
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          setConnectionState(navigator.onLine ? 'disconnected' : 'offline');
          if (navigator.onLine && realtimeRetryTimer.current === null) {
            realtimeRetryTimer.current = window.setTimeout(() => {
              realtimeRetryTimer.current = null;
              void loadRegistrations(false);
            }, 3_000);
          }
        }
      });

    return () => {
      isCurrentChannel = false;
      if (realtimeRefreshTimer.current !== null) {
        window.clearTimeout(realtimeRefreshTimer.current);
        realtimeRefreshTimer.current = null;
      }
      if (realtimeRetryTimer.current !== null) {
        window.clearTimeout(realtimeRetryTimer.current);
        realtimeRetryTimer.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [branchId, date, loadRegistrations, scheduleRealtimeRefresh]);

  useEffect(
    () => () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return rows;

    return rows.filter((row) => {
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
  }, [query, rows]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / PAGE_SIZE),
  );
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
  }, [branch, date, query]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearRememberedStaffName();
    window.location.assign('/?page=login');
  };

  const registrationCount =
    getCachedRegistrationCount(branch, date) ?? rows.length;

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
            setThemeMode((current) =>
              current === 'dark' ? 'light' : 'dark',
            )
          }
          onLogout={() => void handleLogout()}
        />

        <div className="dym-admin-workspace dym-records-workspace">
          <header className="dym-records-header">
            <div className="dym-records-title">
              <div className="dym-records-title-copy">
                <div className="dym-eyebrow-row">
                  <span className="dym-eyebrow">Sổ đăng ký</span>
                  <Badge label="Dữ liệu chi tiết" variant="info" />
                </div>
                <h1>Danh sách đăng ký</h1>
                <p>
                  Toàn bộ thông tin khách đã khai báo tại{' '}
                  {BRANCH_NAMES[branch]}.
                </p>
              </div>
              <button
                type="button"
                className="dym-records-refresh"
                aria-busy={isLoading}
                disabled={isLoading}
                onClick={() => void loadRegistrations()}
              >
                <ArrowPathIcon aria-hidden="true" />
                {isLoading ? 'Đang tải' : 'Làm mới'}
              </button>
            </div>

            <div className="dym-records-filters" aria-label="Bộ lọc đăng ký">
              <label className="dym-records-field">
                <span>Chi nhánh</span>
                <select
                  value={branch}
                  onChange={(event) => {
                    setBranch(event.target.value as BranchCode);
                    setQuery('');
                  }}
                >
                  {availableBranches.map((value) => (
                    <option key={value} value={value}>
                      {BRANCH_NAMES[value]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="dym-records-field">
                <span>Ngày đăng ký</span>
                <span className="dym-records-date">
                  <CalendarDaysIcon aria-hidden="true" />
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => {
                      setDate(event.target.value);
                      setQuery('');
                    }}
                  />
                </span>
              </label>

              <label className="dym-records-field dym-records-search">
                <span>Tìm kiếm</span>
                <span>
                  <MagnifyingGlassIcon aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Tên, SĐT, CCCD, công ty, địa chỉ..."
                  />
                </span>
              </label>
            </div>
          </header>

          <CustomerNoticeModal
            notification={newRegistrationNotice}
            onClose={() => setNewRegistrationNotice(null)}
          />

          <main className="dym-records-content">
            {connectionState !== 'connected' && (
              <div
                className="dym-connection-alert"
                data-state={connectionState}
                role="status"
                aria-live="polite"
              >
                <SignalSlashIcon aria-hidden="true" />
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
            <div className="dym-records-summary" aria-live="polite">
              <span>
                <strong>{filteredRows.length}</strong> đăng ký
                {filteredRows.length > 0 && (
                  <small>
                    Hiển thị {firstVisibleRow}–{lastVisibleRow}
                  </small>
                )}
              </span>
              {query && (
                <button type="button" onClick={() => setQuery('')}>
                  Xóa tìm kiếm
                </button>
              )}
            </div>

            {(error || identityError) && (
              <div className="dym-records-error" role="alert">
                <span>{error || identityError}</span>
                <button type="button" onClick={() => void loadRegistrations()}>
                  Thử lại
                </button>
              </div>
            )}

            <section
              className="dym-records-panel"
              aria-label="Thông tin khách đăng ký"
            >
              {isLoading ? (
                <div className="dym-records-empty" aria-live="polite">
                  <div className="page-loader-dots" aria-hidden="true" />
                  <strong>Đang tải danh sách đăng ký</strong>
                  <span>Dữ liệu chi tiết đang được lấy an toàn từ Supabase.</span>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="dym-records-empty">
                  <UserGroupIcon aria-hidden="true" />
                  <strong>Không có đăng ký phù hợp</strong>
                  <span>Hãy đổi ngày, chi nhánh hoặc nội dung tìm kiếm.</span>
                  <button
                    type="button"
                    className="dym-records-empty-action"
                    onClick={() => {
                      if (query) {
                        setQuery('');
                      } else if (date !== getTodayInVietnam()) {
                        setDate(getTodayInVietnam());
                      } else {
                        void loadRegistrations();
                      }
                    }}
                  >
                    {query
                      ? 'Xóa tìm kiếm'
                      : date !== getTodayInVietnam()
                        ? 'Xem hôm nay'
                        : 'Làm mới'}
                  </button>
                </div>
              ) : (
                <div className="dym-records-table-scroll">
                  <table className="dym-records-table">
                    <thead>
                      <tr>
                        <th scope="col">Số</th>
                        <th scope="col">Đăng ký</th>
                        <th scope="col">Họ và tên</th>
                        <th scope="col">Ngày sinh</th>
                        <th scope="col">Giới tính</th>
                        <th scope="col">CCCD / Hộ chiếu</th>
                        <th scope="col">Số điện thoại</th>
                        <th scope="col">Tên công ty</th>
                        <th scope="col">Tỉnh / Thành phố</th>
                        <th scope="col">Phường / Xã</th>
                        <th scope="col">Địa chỉ chi tiết</th>
                        <th scope="col">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row) => {
                        const displayState = getDisplayState(row);

                        return (
                          <tr key={row.id}>
                            <td>
                              <strong className="dym-records-queue">
                                {formatQueueNumber(row.queue_number)}
                              </strong>
                            </td>
                            <td>{formatRegistrationTime(row.registered_at)}</td>
                            <td>
                              <strong className="dym-records-name">
                                {row.full_name}
                              </strong>
                            </td>
                            <td>{formatBirthDate(row.birth_date)}</td>
                            <td>{row.gender}</td>
                            <td>
                              <span className="dym-records-mono">
                                {row.identity_document}
                              </span>
                            </td>
                            <td>
                              <span className="dym-records-mono">
                                {formatPhone(row.phone_number)}
                              </span>
                            </td>
                            <td>{row.company_name || '—'}</td>
                            <td>{row.province}</td>
                            <td>{row.ward}</td>
                            <td>{row.address_detail}</td>
                            <td>
                              <span
                                className="dym-records-status"
                                data-state={displayState.key}
                              >
                                {displayState.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!isLoading && filteredRows.length > 0 && (
                <nav
                  className="dym-records-pagination"
                  aria-label="Phân trang danh sách đăng ký"
                >
                  <span>
                    {firstVisibleRow}–{lastVisibleRow} trong{' '}
                    {filteredRows.length} đăng ký
                  </span>
                  <div>
                    <button
                      type="button"
                      aria-label="Trang trước"
                      disabled={visiblePage === 1}
                      onClick={() =>
                        setCurrentPage((page) => Math.max(1, page - 1))
                      }
                    >
                      <ChevronLeftIcon aria-hidden="true" />
                      <span>Trước</span>
                    </button>
                    <span aria-current="page">
                      Trang <strong>{visiblePage}</strong> / {totalPages}
                    </span>
                    <button
                      type="button"
                      aria-label="Trang sau"
                      disabled={visiblePage === totalPages}
                      onClick={() =>
                        setCurrentPage((page) =>
                          Math.min(totalPages, page + 1),
                        )
                      }
                    >
                      <span>Sau</span>
                      <ChevronRightIcon aria-hidden="true" />
                    </button>
                  </div>
                </nav>
              )}
            </section>

            <footer className="dym-admin-footer">
              <span>© 2026 DYM Medical Center</span>
              <span className="dym-realtime-state" data-state={connectionState}>
                {connectionState === 'connected' ? (
                  <CheckCircleIcon aria-hidden="true" />
                ) : (
                  <SignalSlashIcon aria-hidden="true" />
                )}
                {connectionState === 'connected'
                  ? 'Đã kết nối Supabase Realtime'
                  : connectionState === 'offline'
                    ? 'Không có kết nối Internet'
                    : 'Đang kết nối lại Realtime'}
              </span>
            </footer>
          </main>
        </div>
      </div>
    </Theme>
  );
}

export default RegistrationsPage;
