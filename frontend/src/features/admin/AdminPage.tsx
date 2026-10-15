import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SignalSlashIcon } from '@heroicons/react/24/outline';
import { Theme } from '@astryxdesign/core/theme';
import '@astryxdesign/core/astryx.css';
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

import { useAdminTheme } from './hooks/useAdminTheme';
import { useSidebarResponsive } from './hooks/useSidebarResponsive';
import { useStaffIdentity } from './hooks/useStaffIdentity';
import { useDashboardQueueQuery } from './hooks/useDashboardQueueQuery';
import { useQueryClient } from '@tanstack/react-query';
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

export function AdminPage({ authorizedIsAdmin }: { authorizedIsAdmin: boolean }) {
  const queryClient = useQueryClient();
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
  const [pendingQueueAction, setPendingQueueAction] =
    useState<PendingQueueAction>(null);
  const [pendingUndoId, setPendingUndoId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState(
    'Chưa có số đang được gọi tại chi nhánh này.',
  );
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>(
      navigator.onLine ? 'connected' : 'offline',
    );
  const [customerNotification, setCustomerNotification] =
    useState<CustomerNotificationItem | null>(null);
  const [isNotificationSoundEnabled, setIsNotificationSoundEnabled] =
    useState(false);

  const notificationTimer = useRef<number | null>(null);
  const notificationSoundEnabledRef = useRef(false);

  const branchId = branchIds[branch];
  const isMutating = pendingQueueAction !== null || pendingUndoId !== null;

  const {
    data: dashboardData,
    isLoading: isDataLoading,
    error: queryError,
    refetch: refetchDashboard,
  } = useDashboardQueueQuery({
    branch,
    branchId,
    date,
  });

  useEffect(() => {
    if (dashboardData) {
      setRows(dashboardData.rows);
      setCurrentQueue(dashboardData.activeQueue);
      setCurrentPatient(dashboardData.activePatient);
      setAnnouncement(dashboardData.announcement);
    }
  }, [dashboardData]);

  const dataError = actionError || (queryError ? 'Không thể tải dữ liệu từ máy chủ.' : null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Tiếp nhận | DYM Medical Center';
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
      void refetchDashboard();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [refetchDashboard]);

  useEffect(() => {
    if (!branchId) return;

    let isCurrentChannel = true;
    if (!navigator.onLine) {
      setConnectionState('offline');
    }

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
          void queryClient.invalidateQueries({
            queryKey: ['dashboardQueue', branch, date],
          });
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
        () => {
          void queryClient.invalidateQueries({
            queryKey: ['dashboardQueue', branch, date],
          });
        },
      )
      .subscribe((status) => {
        if (!isCurrentChannel) return;

        if (status === 'SUBSCRIBED') {
          setConnectionState('connected');
          return;
        }

        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          setConnectionState(navigator.onLine ? 'disconnected' : 'offline');
          if (navigator.onLine) {
            void refetchDashboard();
          }
        }
      });

    return () => {
      isCurrentChannel = false;
      if (notificationTimer.current !== null) {
        window.clearTimeout(notificationTimer.current);
      }
      void channel.unsubscribe();
    };
  }, [branch, branchId, date, queryClient, refetchDashboard, showCustomerNotification]);

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
    setActionError(null);
    const { data, error } = await supabase.rpc('call_next_queue', {
      p_branch_code: branch,
    });

    const result = (Array.isArray(data) ? data[0] : data) as
      | QueueActionResult
      | undefined;

    if (error) {
      setActionError('Không thể gọi số tiếp theo.');
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
      void queryClient.invalidateQueries({
        queryKey: ['dashboardQueue', branch, date],
      });
    }
    setPendingQueueAction(null);
  };

  const recallCurrent = async () => {
    if (isMutating) return;

    setPendingQueueAction('recall');
    setActionError(null);
    const { data, error } = await supabase.rpc('recall_current_queue', {
      p_branch_code: branch,
    });
    const result = (Array.isArray(data) ? data[0] : data) as
      | QueueActionResult
      | undefined;

    if (error) {
      setActionError('Không thể gọi lại số hiện tại.');
    } else if (!result) {
      setAnnouncement('Chưa có số để gọi lại.');
    } else {
      const nextQueueNumber = formatQueueNumber(result.queue_number);
      setCurrentQueue(nextQueueNumber);
      setAnnouncement(`Đã gọi lại số ${nextQueueNumber} — ${currentPatient}.`);
      void queryClient.invalidateQueries({
        queryKey: ['dashboardQueue', branch, date],
      });
    }
    setPendingQueueAction(null);
  };

  const returnToWaiting = async (row: RegistrationRow) => {
    if (isMutating || row.status !== 'called') return;

    setPendingUndoId(row.id);
    setActionError(null);

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
        void queryClient.invalidateQueries({
          queryKey: ['dashboardQueue', branch, date],
        });
      } else if (error.message.includes('ONLY_TODAY_ALLOWED')) {
        setActionError('Chỉ có thể hoàn tác lượt gọi trong ngày hiện tại.');
      } else {
        setActionError(`Không thể đưa số ${row.queueNumber} về Chờ gọi.`);
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

      void queryClient.invalidateQueries({
        queryKey: ['dashboardQueue', branch, date],
      });
    }

    setPendingUndoId(null);
  };

  const callNextRef = useRef(callNext);
  const recallCurrentRef = useRef(recallCurrent);
  useEffect(() => {
    callNextRef.current = callNext;
    recallCurrentRef.current = recallCurrent;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeTag = (event.target as HTMLElement)?.tagName?.toLowerCase();
      const isInput =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select' ||
        (event.target as HTMLElement)?.isContentEditable;

      // Focus search on '/'
      if (event.key === '/' && !isInput) {
        event.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('.dym-search-field');
        searchInput?.focus();
        return;
      }

      // Space for Call Next
      if (event.code === 'Space' && !isInput) {
        event.preventDefault();
        if (!isMutating && counts.waiting > 0) {
          void callNextRef.current();
        }
        return;
      }

      // Alt + R for Recall
      if (event.altKey && (event.key === 'r' || event.key === 'R')) {
        event.preventDefault();
        if (!isMutating && currentQueue !== '—') {
          void recallCurrentRef.current();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [counts.waiting, currentQueue, isMutating]);

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
            {(connectionState === 'offline' ||
              connectionState === 'disconnected') && (
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
              <span>© 2026 DYM Medical Center — Hệ thống điều phối phòng khám</span>
            </footer>
          </main>
        </div>
      </div>
    </Theme>
  );
}

export default AdminPage;
