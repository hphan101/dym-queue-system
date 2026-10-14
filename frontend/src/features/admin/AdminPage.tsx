import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircleIcon,
  SignalSlashIcon,
} from '@heroicons/react/24/outline';
import { Theme } from '@astryxdesign/core/theme';
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

import { useAdminTheme } from './hooks/useAdminTheme';
import { useSidebarResponsive } from './hooks/useSidebarResponsive';
import { useStaffIdentity } from './hooks/useStaffIdentity';
import { normalizeSearch } from './utils/adminFormatters';
import { playNotificationChime } from './utils/audioNotification';

import { AdminHeader } from './components/AdminHeader';
import {
  CustomerNoticeModal,
  type CustomerNotificationItem,
} from './components/CustomerNoticeModal';
import {
  QueueMetrics,
  type QueueStatus,
} from './components/QueueMetrics';
import {
  QueueTable,
  type RegistrationRow,
} from './components/QueueTable';

type PendingQueueAction = 'next' | 'recall' | null;
type RealtimeConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'offline';

interface RegistrationRecord {
  id: string;
  queue_date: string;
  queue_number: number;
  full_name: string;
  birth_date: string;
  gender: string;
  phone_number: string;
  company_name: string | null;
  registered_at: string;
  first_called_at: string | null;
}

interface QueueActionResult {
  registration_id: string;
  queue_number: string;
  called_at: string;
  revision: number;
}

interface UndoQueueResult {
  registration_id: string;
  queue_number: string;
  display_cleared: boolean;
}

const DASHBOARD_PAGE_SIZE = 20;
const CUSTOMER_NOTIFICATION_DURATION_MS = 8_000;

function formatBirthDate(value: string) {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatRegistrationTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function AdminPage({ authorizedIsAdmin }: { authorizedIsAdmin: boolean }) {
  const { themeMode, setThemeMode } = useAdminTheme();
  const { isSidebarCollapsed, setIsSidebarCollapsed } = useSidebarResponsive();
  const { staffName, branchIds, identityError } = useStaffIdentity();

  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [branch, setBranch] = useState<BranchCode>('q1');
  const [date, setDate] = useState(getTodayInVietnam);
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [currentQueue, setCurrentQueue] = useState('—');
  const [currentPatient, setCurrentPatient] = useState('Chưa gọi số');
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [pendingQueueAction, setPendingQueueAction] =
    useState<PendingQueueAction>(null);
  const [pendingUndoId, setPendingUndoId] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState(
    'Chưa có số đang được gọi tại chi nhánh này.',
  );
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>(
      navigator.onLine ? 'connecting' : 'offline',
    );
  const [customerNotification, setCustomerNotification] =
    useState<CustomerNotificationItem | null>(null);
  const [isNotificationSoundEnabled, setIsNotificationSoundEnabled] =
    useState(false);

  const realtimeRefreshTimer = useRef<number | null>(null);
  const realtimeRetryTimer = useRef<number | null>(null);
  const notificationTimer = useRef<number | null>(null);
  const notificationSoundEnabledRef = useRef(false);

  const branchId = branchIds[branch];
  const isMutating = pendingQueueAction !== null || pendingUndoId !== null;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Quản trị lượt khám | DYM Medical Center';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  // Sync branch selection if initial branch is not in allowed list
  useEffect(() => {
    const availableCodes = Object.keys(branchIds) as BranchCode[];
    if (availableCodes.length > 0 && !branchIds[branch]) {
      setBranch(availableCodes[0]);
    }
  }, [branchIds, branch]);

  const loadDashboard = useCallback(async (showLoading = true) => {
    if (!branchId) return;

    if (showLoading) setIsDataLoading(true);
    setDataError(null);

    const [registrationsResult, displayResult] = await Promise.all([
      supabase.rpc('get_dashboard_registrations', {
        p_branch_code: branch,
        p_queue_date: date,
      }),
      supabase
        .from('branch_display_state')
        .select('registration_id, queue_date, queue_number, called_at')
        .eq('branch_id', branchId)
        .maybeSingle(),
    ]);

    if (registrationsResult.error || displayResult.error) {
      console.error('Không thể tải dữ liệu bàn điều phối:', {
        registrations: registrationsResult.error?.message,
        display: displayResult.error?.message,
      });
      setDataError('Không thể tải dữ liệu từ máy chủ.');
      setIsDataLoading(false);
      return;
    }

    const fetchedRows = (
      (registrationsResult.data as RegistrationRecord[] | null) ?? []
    ).map(
      (record): RegistrationRow => ({
        id: record.id,
        queueNumber: formatQueueNumber(record.queue_number),
        registeredAt: formatRegistrationTime(record.registered_at),
        date: record.queue_date,
        fullName: record.full_name,
        birthDate: formatBirthDate(record.birth_date),
        gender: record.gender,
        phone: record.phone_number,
        companyName: record.company_name?.trim() || '—',
        branch,
        status: record.first_called_at ? 'called' : 'waiting',
      }),
    );

    setRows(fetchedRows);
    rememberRegistrationCount(branch, date, fetchedRows.length);

    const displayData = displayResult.data;
    if (
      displayData?.queue_number &&
      displayData.queue_date === date &&
      displayData.registration_id
    ) {
      const activeQueue = formatQueueNumber(displayData.queue_number);
      const activePatient = fetchedRows.find(
        (row) => row.id === displayData.registration_id,
      );
      setCurrentQueue(activeQueue);
      setCurrentPatient(activePatient?.fullName ?? 'Khách đang được gọi');
      setAnnouncement(
        `Đang gọi số ${activeQueue}${activePatient ? ` — ${activePatient.fullName}` : ''}.`,
      );
    } else {
      setCurrentQueue('—');
      setCurrentPatient('Chưa gọi số');
      setAnnouncement('Chưa có số đang được gọi tại chi nhánh này.');
    }

    setIsDataLoading(false);
  }, [branch, branchId, date]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimer.current !== null) {
      window.clearTimeout(realtimeRefreshTimer.current);
    }

    realtimeRefreshTimer.current = window.setTimeout(() => {
      realtimeRefreshTimer.current = null;
      void loadDashboard(false);
    }, 200);
  }, [loadDashboard]);

  const showCustomerNotification = useCallback(
    (record: { id?: string; queue_number?: number; full_name?: string }) => {
      if (!record.id || !record.queue_number || !record.full_name) return;

      if (notificationTimer.current !== null) {
        window.clearTimeout(notificationTimer.current);
      }

      setCustomerNotification({
        id: record.id,
        queueNumber: formatQueueNumber(record.queue_number),
        fullName: record.full_name,
      });

      notificationTimer.current = window.setTimeout(() => {
        notificationTimer.current = null;
        setCustomerNotification(null);
      }, CUSTOMER_NOTIFICATION_DURATION_MS);

      if (notificationSoundEnabledRef.current) {
        void playNotificationChime(0.1);
      }
    },
    [],
  );

  const toggleNotificationSound = async () => {
    const nextEnabled = !notificationSoundEnabledRef.current;
    notificationSoundEnabledRef.current = nextEnabled;
    setIsNotificationSoundEnabled(nextEnabled);

    if (nextEnabled) {
      void playNotificationChime(0.1);
    }
  };

  useEffect(() => {
    const handleOffline = () => setConnectionState('offline');
    const handleOnline = () => {
      setConnectionState('connecting');
      void loadDashboard(false);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (!branchId) return;

    let isCurrentChannel = true;
    setConnectionState(navigator.onLine ? 'connecting' : 'offline');

    const channel = supabase
      .channel(`admin:${branchId}:${date}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'registrations',
          filter: `branch_id=eq.${branchId}`,
          select: [
            'id',
            'branch_id',
            'queue_date',
            'queue_number',
            'full_name',
            'phone_number',
            'state',
            'registered_at',
            'first_called_at',
            'last_called_at',
            'updated_at',
          ],
        },
        (payload) => {
          if (
            payload.eventType === 'INSERT' &&
            String(payload.new.queue_date ?? '') === date
          ) {
            showCustomerNotification(payload.new);
          }
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'branch_display_state',
          filter: `branch_id=eq.${branchId}`,
        },
        scheduleRealtimeRefresh,
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
              void loadDashboard(false);
            }, 3_000);
          }
        }
      });

    return () => {
      isCurrentChannel = false;
      if (realtimeRefreshTimer.current !== null) {
        window.clearTimeout(realtimeRefreshTimer.current);
      }
      if (realtimeRetryTimer.current !== null) {
        window.clearTimeout(realtimeRetryTimer.current);
      }
      if (notificationTimer.current !== null) {
        window.clearTimeout(notificationTimer.current);
      }
      void channel.unsubscribe();
    };
  }, [branchId, date, loadDashboard, scheduleRealtimeRefresh, showCustomerNotification]);

  const rowsForDay = useMemo(
    () => rows.filter((row) => row.branch === branch && row.date === date),
    [branch, date, rows],
  );

  const counts = useMemo(
    () =>
      rowsForDay.reduce<Record<QueueStatus, number>>(
        (accumulator, row) => {
          accumulator[row.status] += 1;
          return accumulator;
        },
        { waiting: 0, called: 0 },
      ),
    [rowsForDay],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return rowsForDay;

    return rowsForDay.filter((row) =>
      normalizeSearch(
        [
          row.queueNumber,
          row.fullName,
          row.birthDate,
          row.gender,
          row.phone,
          row.companyName,
        ].join(' '),
      ).includes(normalizedQuery),
    );
  }, [query, rowsForDay]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / DASHBOARD_PAGE_SIZE),
  );
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (visiblePage - 1) * DASHBOARD_PAGE_SIZE;
  const paginatedRows = useMemo(
    () =>
      filteredRows.slice(
        pageStartIndex,
        pageStartIndex + DASHBOARD_PAGE_SIZE,
      ),
    [filteredRows, pageStartIndex],
  );
  const firstVisibleRow = filteredRows.length === 0 ? 0 : pageStartIndex + 1;
  const lastVisibleRow = Math.min(
    pageStartIndex + DASHBOARD_PAGE_SIZE,
    filteredRows.length,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [branch, date, query]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const callNext = async () => {
    if (isMutating) return;

    setPendingQueueAction('next');
    setDataError(null);
    const { data, error } = await supabase.rpc('call_next_queue', {
      p_branch_code: branch,
    });

    const result = (Array.isArray(data) ? data[0] : data) as
      | QueueActionResult
      | undefined;

    if (error) {
      setDataError('Không thể gọi số tiếp theo.');
    } else if (!result) {
      setAnnouncement('Không còn khách trong hàng chờ để gọi.');
    } else {
      const patient = rowsForDay.find(
        (row) => row.id === result.registration_id,
      );
      const nextQueueNumber = formatQueueNumber(result.queue_number);
      setCurrentQueue(nextQueueNumber);
      setCurrentPatient(patient?.fullName ?? 'Khách đang được gọi');
      setAnnouncement(
        `Đã gọi số ${nextQueueNumber}${patient ? ` — ${patient.fullName}` : ''}.`,
      );
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.id === result.registration_id
            ? { ...row, status: 'called' }
            : row,
        ),
      );
    }
    setPendingQueueAction(null);
  };

  const recallCurrent = async () => {
    if (isMutating) return;

    setPendingQueueAction('recall');
    setDataError(null);
    const { data, error } = await supabase.rpc('recall_current_queue', {
      p_branch_code: branch,
    });
    const result = (Array.isArray(data) ? data[0] : data) as
      | QueueActionResult
      | undefined;

    if (error) {
      setDataError('Không thể gọi lại số hiện tại.');
    } else if (!result) {
      setAnnouncement('Chưa có số để gọi lại.');
    } else {
      const nextQueueNumber = formatQueueNumber(result.queue_number);
      setCurrentQueue(nextQueueNumber);
      setAnnouncement(`Đã gọi lại số ${nextQueueNumber} — ${currentPatient}.`);
    }
    setPendingQueueAction(null);
  };

  const returnToWaiting = async (row: RegistrationRow) => {
    if (isMutating || row.status !== 'called') return;

    setPendingUndoId(row.id);
    setDataError(null);

    const { data, error } = await supabase.rpc(
      'return_called_queue_to_waiting',
      {
        p_branch_code: branch,
        p_registration_id: row.id,
      },
    );
    const result = (Array.isArray(data) ? data[0] : data) as
      | UndoQueueResult
      | undefined;

    if (error) {
      if (error.message.includes('ALREADY_WAITING')) {
        setAnnouncement(`Số ${row.queueNumber} đã ở trạng thái Chờ gọi.`);
        void loadDashboard(false);
      } else if (error.message.includes('ONLY_TODAY_ALLOWED')) {
        setDataError('Chỉ có thể hoàn tác lượt gọi trong ngày hiện tại.');
      } else {
        setDataError(`Không thể đưa số ${row.queueNumber} về Chờ gọi.`);
      }
    } else if (result) {
      setRows((currentRows) =>
        currentRows.map((currentRow) =>
          currentRow.id === result.registration_id
            ? { ...currentRow, status: 'waiting' }
            : currentRow,
        ),
      );

      if (result.display_cleared) {
        setCurrentQueue('—');
        setCurrentPatient('Chưa gọi số');
        setAnnouncement('Đã xóa số đang hiển thị tại màn hình chờ.');
      } else {
        setAnnouncement(`Đã đưa số ${row.queueNumber} về Chờ gọi.`);
      }
    }

    setPendingUndoId(null);
  };

  const handleBranchChange = (nextBranch: BranchCode) => {
    setBranch(nextBranch);
    setQuery('');
  };

  const handleDateChange = (nextDate: string) => {
    setDate(nextDate);
    setQuery('');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearRememberedStaffName();
    window.location.assign('/?page=login');
  };

  const branchOptions = useMemo(
    () =>
      (Object.keys(branchIds) as BranchCode[]).map((code) => ({
        value: code,
        label: BRANCH_NAMES[code],
      })),
    [branchIds],
  );

  const registrationCount =
    getCachedRegistrationCount(branch, date) ?? rowsForDay.length;

  return (
    <Theme theme={dymAdminTheme} mode={themeMode}>
      <div className="dym-admin-shell" data-color-mode={themeMode}>
        <AdminSidebar
          activePage="dashboard"
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

        <div className="dym-admin-workspace">
          <AdminHeader
            branch={branch}
            branchOptions={branchOptions}
            onBranchChange={handleBranchChange}
            date={date}
            onDateChange={handleDateChange}
            isNotificationSoundEnabled={isNotificationSoundEnabled}
            onToggleNotificationSound={() => void toggleNotificationSound()}
          />

          <CustomerNoticeModal
            notification={customerNotification}
            onClose={() => setCustomerNotification(null)}
          />

          <main id="overview" className="dym-admin-content">
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
            {(dataError || identityError) && (
              <div className="dym-data-error" role="alert" aria-live="polite">
                {dataError || identityError}
              </div>
            )}

            <QueueMetrics
              currentQueue={currentQueue}
              currentPatient={currentPatient}
              branchName={BRANCH_NAMES[branch]}
              announcement={announcement}
              isMutating={isMutating}
              isDataLoading={isDataLoading}
              counts={counts}
              totalDayCount={rowsForDay.length}
              pendingAction={pendingQueueAction}
              onCallNext={() => void callNext()}
              onRecallCurrent={() => void recallCurrent()}
            />

            <QueueTable
              filteredRows={filteredRows}
              paginatedRows={paginatedRows}
              query={query}
              onQueryChange={setQuery}
              isDataLoading={isDataLoading}
              isMutating={isMutating}
              pendingUndoId={pendingUndoId}
              branchName={BRANCH_NAMES[branch]}
              date={date}
              today={getTodayInVietnam()}
              visiblePage={visiblePage}
              totalPages={totalPages}
              firstVisibleRow={firstVisibleRow}
              lastVisibleRow={lastVisibleRow}
              onPageChange={setCurrentPage}
              onReturnToWaiting={(row) => void returnToWaiting(row)}
            />

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

export default AdminPage;
