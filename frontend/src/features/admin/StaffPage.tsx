import { useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  KeyIcon,
  LockClosedIcon,
  LockOpenIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Theme } from '@astryxdesign/core/theme';
import '@astryxdesign/core/astryx.css';

import { supabase } from '../../lib/supabaseClient';
import type { BranchCode } from '../../types/domain';
import { AdminSidebar } from './AdminSidebar';
import {
  clearRememberedStaffName,
  getInitialStaffName,
  rememberStaffName,
} from './adminIdentity';
import { getCachedRegistrationCount } from './registrationCountCache';
import { dymAdminTheme } from './theme';
import './admin.css';
import './staff.css';

import { useAdminTheme } from './hooks/useAdminTheme';
import { useSidebarResponsive } from './hooks/useSidebarResponsive';
import { formatDateTime, normalizeSearch } from './utils/adminFormatters';
import { AdminHeader } from './components/AdminHeader';
import type {
  StaffAccount,
  StaffFormState,
  StaffStatusTab,
} from './types';
import { StaffFormModal } from './components/StaffFormModal';
import { StaffLockConfirmModal } from './components/StaffLockConfirmModal';
import { StaffPasswordResetModal } from './components/StaffPasswordResetModal';
import { HighlightText } from './components/HighlightText';
import { useAdminScope } from './hooks/useAdminScope';

interface StaffApiResponse {
  success: boolean;
  code?: string;
  staff?: StaffAccount[];
}

const EMPTY_FORM: StaffFormState = {
  userId: null,
  displayName: '',
  loginName: '',
  password: '',
  role: 'receptionist',
  branchCodes: ['q1'],
};
let cachedStaffAccounts: StaffAccount[] | null = null;

function formatLastSignIn(value: string | null) {
  return value ? formatDateTime(value) : 'Chưa đăng nhập';
}

function apiErrorMessage(code?: string) {
  switch (code) {
    case 'ACCOUNT_EXISTS':
      return 'Tài khoản đăng nhập này đã tồn tại trên hệ thống.';
    case 'SELF_ADMIN_PROTECTION':
      return 'Bạn không thể tự khóa hoặc tự hạ quyền quản trị của chính mình.';
    case 'INVALID_DATA':
      return 'Thông tin không hợp lệ. Vui lòng kiểm tra lại họ tên, tài khoản và mật khẩu.';
    case 'ADMIN_REQUIRED':
      return 'Chỉ quản trị viên mới được quản lý nhân viên.';
    case 'STAFF_NOT_FOUND':
      return 'Không tìm thấy tài khoản nhân viên.';
    case 'CREATE_FAILED':
      return 'Không thể tạo tài khoản trên hệ thống xác thực. Vui lòng kiểm tra lại mật khẩu (tối thiểu 6 ký tự).';
    case 'ORIGIN_NOT_ALLOWED':
      return 'Địa chỉ mạng này chưa được cấp quyền CORS. Vui lòng kiểm tra cấu hình mạng.';
    case 'AUTH_REQUIRED':
      return 'Phiên làm việc đã hết hạn. Vui lòng tải lại trang hoặc đăng nhập lại.';
    case 'SERVER_ERROR':
      return 'Lỗi máy chủ khi xử lý dữ liệu. Vui lòng thử lại sau.';
    default:
      return code && code !== 'REQUEST_FAILED'
        ? `Thao tác không thành công (${code}). Vui lòng thử lại.`
        : 'Không thể thực hiện thao tác. Vui lòng thử lại.';
  }
}

async function requestStaffApi(
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('AUTH_REQUIRED');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${supabaseUrl}/functions/v1/manage-staff`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: publishableKey,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let result: StaffApiResponse | null = null;
  try {
    result = (await response.json()) as StaffApiResponse;
  } catch {
    // Non-JSON response
  }

  if (!response.ok || !result?.success) {
    const fallbackCode = response.status === 403 ? 'ORIGIN_NOT_ALLOWED' : 'REQUEST_FAILED';
    throw new Error(result?.code ?? fallbackCode);
  }
  return result;
}

export function StaffPage({
  isActiveTab = true,
}: {
  isActiveTab?: boolean;
} = {}) {
  const { themeMode, setThemeMode } = useAdminTheme();
  const { isSidebarCollapsed, setIsSidebarCollapsed } = useSidebarResponsive();
  const { branch: scopeBranch, date: scopeDate } = useAdminScope();
  const [staffName, setStaffName] = useState(getInitialStaffName);
  const [staff, setStaff] = useState<StaffAccount[]>(
    () => cachedStaffAccounts ?? [],
  );
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StaffStatusTab>('all');
  const [isLoading, setIsLoading] = useState(cachedStaffAccounts === null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<StaffFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [accountPendingConfirmation, setAccountPendingConfirmation] =
    useState<StaffAccount | null>(null);
  const [passwordResetAccount, setPasswordResetAccount] = useState<StaffAccount | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmedPassword, setConfirmedPassword] = useState('');
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const searchInputId = useId();

  useEffect(() => {
    if (!isActiveTab) return;
    document.title = 'Quản lý nhân viên | DYM Medical Center';
  }, [isActiveTab]);

  const loadStaff = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('AUTH_REQUIRED');

      const [{ data: profile }, result] = await Promise.all([
        supabase
          .from('profiles')
          .select('display_name, role')
          .eq('user_id', user.id)
          .maybeSingle(),
        requestStaffApi('GET'),
      ]);

      if (profile?.display_name) {
        const nextStaffName = String(profile.display_name);
        rememberStaffName(nextStaffName);
        setStaffName(nextStaffName);
      }
      const nextStaff = result.staff ?? [];
      cachedStaffAccounts = nextStaff;
      setStaff(nextStaff);
    } catch (requestError) {
      const code = requestError instanceof Error ? requestError.message : undefined;
      setError(apiErrorMessage(code));
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadStaff(cachedStaffAccounts === null);
  }, []);

  // Global search shortcut '/'
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

  const activeCount = useMemo(
    () => staff.filter((item) => item.isActive).length,
    [staff],
  );

  const tabCounts = useMemo(() => {
    const active = activeCount;
    const locked = staff.length - active;
    return { all: staff.length, active, locked };
  }, [activeCount, staff.length]);

  const filteredStaff = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    return staff.filter((account) => {
      // Tab filter
      if (statusFilter === 'active' && !account.isActive) return false;
      if (statusFilter === 'locked' && account.isActive) return false;

      // Query filter
      if (!normalizedQuery) return true;

      const searchable = [
        account.displayName,
        account.loginName,
        account.role === 'admin' ? 'quản trị' : 'lễ tân',
        ...account.branches.map((b) => b.name),
      ].join(' ');

      return normalizeSearch(searchable).includes(normalizedQuery);
    });
  }, [query, staff, statusFilter]);

  const openCreateForm = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (account: StaffAccount) => {
    setForm({
      userId: account.userId,
      displayName: account.displayName,
      loginName: account.loginName,
      password: '',
      role: account.role,
      branchCodes: account.branches.map((branch) => branch.code),
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const toggleBranch = (branchCode: BranchCode) => {
    setForm((current) => ({
      ...current,
      branchCodes: current.branchCodes.includes(branchCode)
        ? current.branchCodes.filter((code) => code !== branchCode)
        : [...current.branchCodes, branchCode],
    }));
  };

  const saveStaff = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (
      form.displayName.trim().length < 2 ||
      !/^[a-z0-9][a-z0-9._-]{2,31}$/i.test(form.loginName.trim()) ||
      (!form.userId && form.password.length < 6) ||
      (form.role === 'receptionist' && form.branchCodes.length === 0)
    ) {
      setFormError(
        'Vui lòng nhập đủ thông tin, mật khẩu từ 6 ký tự và chọn ít nhất một chi nhánh cho lễ tân.',
      );
      return;
    }

    setIsSaving(true);
    try {
      if (form.userId) {
        await requestStaffApi('POST', {
          action: 'update',
          userId: form.userId,
          displayName: form.displayName,
          loginName: form.loginName,
          role: form.role,
          branchCodes: form.branchCodes,
        });
        setSuccess(`Đã cập nhật ${form.displayName.trim()}.`);
      } else {
        await requestStaffApi('POST', {
          action: 'create',
          loginName: form.loginName,
          password: form.password,
          displayName: form.displayName,
          role: form.role,
          branchCodes: form.branchCodes,
        });
        setSuccess(`Đã tạo tài khoản cho ${form.displayName.trim()}.`);
      }
      setIsFormOpen(false);
      await loadStaff(false);
    } catch (requestError) {
      const code = requestError instanceof Error ? requestError.message : undefined;
      setFormError(apiErrorMessage(code));
    } finally {
      setIsSaving(false);
    }
  };

  const setAccountActive = async (account: StaffAccount) => {
    setPendingAccountId(account.userId);
    setError(null);
    setSuccess(null);
    try {
      await requestStaffApi('POST', {
        action: 'set-active',
        userId: account.userId,
        isActive: !account.isActive,
      });
      setSuccess(
        `Đã ${account.isActive ? 'khóa' : 'mở khóa'} tài khoản ${account.displayName}.`,
      );
      await loadStaff(false);
    } catch (requestError) {
      const code = requestError instanceof Error ? requestError.message : undefined;
      setError(apiErrorMessage(code));
    } finally {
      setPendingAccountId(null);
    }
  };

  const requestAccountActiveChange = (account: StaffAccount) => {
    if (account.isActive) {
      setAccountPendingConfirmation(account);
      return;
    }
    void setAccountActive(account);
  };

  const openPasswordReset = (account: StaffAccount) => {
    setPasswordResetAccount(account);
    setNewPassword('');
    setConfirmedPassword('');
    setPasswordResetError(null);
  };

  const resetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordResetAccount) return;

    if (newPassword.length < 6) {
      setPasswordResetError('Mật khẩu mới cần ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmedPassword) {
      setPasswordResetError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsResettingPassword(true);
    setPasswordResetError(null);
    try {
      await requestStaffApi('POST', {
        action: 'reset-password',
        userId: passwordResetAccount.userId,
        password: newPassword,
      });
      setSuccess(`Đã đổi mật khẩu cho ${passwordResetAccount.displayName}.`);
      setPasswordResetAccount(null);
    } catch (requestError) {
      const code = requestError instanceof Error ? requestError.message : undefined;
      setPasswordResetError(apiErrorMessage(code));
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearRememberedStaffName();
    window.location.assign('/?page=login');
  };

  const registrationCount =
    getCachedRegistrationCount(scopeBranch, scopeDate) ?? 0;

  return (
    <Theme theme={dymAdminTheme} mode={themeMode}>
      <div className="dym-admin-shell" data-color-mode={themeMode}>
        <AdminSidebar
          activePage="staff"
          branch={scopeBranch}
          date={scopeDate}
          registrationCount={registrationCount}
          staffName={staffName}
          isAdmin={true}
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
            title="Quản lý nhân viên"
            actions={
              <>
                <button
                  type="button"
                  className="dym-btn-action-primary"
                  onClick={openCreateForm}
                  title="Thêm tài khoản nhân viên mới"
                >
                  <PlusIcon className="w-4 h-4" />
                  <span>Thêm nhân viên</span>
                </button>
                <button
                  type="button"
                  className="dym-btn-action-secondary"
                  disabled={isLoading}
                  onClick={() => void loadStaff()}
                  title="Làm mới danh sách nhân viên (F5)"
                >
                  <ArrowPathIcon className={`w-4 h-4 shrink-0 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>{isLoading ? 'Đang tải...' : 'Làm mới'}</span>
                </button>
              </>
            }
          />

          <main className="dym-admin-content">
            {error && (
              <div className="dym-data-error" role="alert">
                {error}
              </div>
            )}
            {success && (
              <div className="dym-staff-success" role="status">
                {success}
              </div>
            )}

            {/* Overview Summary Metrics Grid */}
            <section
              className="dym-metrics-summary-grid"
              aria-label="Tổng quan nhân viên"
            >
              <div className="dym-metric-summary-card">
                <div className="dym-metric-summary-header">
                  <span className="dym-metric-summary-label">Tổng tài khoản</span>
                  <UserGroupIcon className="dym-metric-summary-icon" aria-hidden="true" />
                </div>
                <div className="dym-metric-summary-value-row">
                  <strong className="dym-metric-summary-number">
                    {staff.length}
                  </strong>
                  <span className="dym-metric-summary-unit">nhân sự</span>
                </div>
                <div className="dym-metric-summary-footnote">
                  Tổng số tài khoản đã đăng ký trên hệ thống
                </div>
              </div>

              <div className="dym-metric-summary-card">
                <div className="dym-metric-summary-header">
                  <span className="dym-metric-summary-label">Đang hoạt động</span>
                  <CheckCircleIcon className="dym-metric-summary-icon text-emerald-500" aria-hidden="true" />
                </div>
                <div className="dym-metric-summary-value-row">
                  <strong className="dym-metric-summary-number text-emerald-600 dark:text-emerald-400">
                    {activeCount}
                  </strong>
                  <span className="dym-metric-summary-unit">tài khoản</span>
                </div>
                <div className="dym-metric-summary-footnote">
                  Có quyền truy cập và điều phối tại quầy
                </div>
              </div>

              <div className="dym-metric-summary-card">
                <div className="dym-metric-summary-header">
                  <span className="dym-metric-summary-label">Đã khóa / Tạm dừng</span>
                  <LockClosedIcon className="dym-metric-summary-icon text-amber-500" aria-hidden="true" />
                </div>
                <div className="dym-metric-summary-value-row">
                  <strong className="dym-metric-summary-number text-amber-600 dark:text-amber-400">
                    {staff.length - activeCount}
                  </strong>
                  <span className="dym-metric-summary-unit">tạm dừng</span>
                </div>
                <div className="dym-metric-summary-footnote">
                  Tài khoản vô hiệu hóa không thể đăng nhập
                </div>
              </div>
            </section>

            {/* Precision Table Panel */}
            <section
              className="dym-registry-panel"
              aria-labelledby="staff-list-title"
            >
              {/* Toolbar */}
              <div className="dym-registry-toolbar">
                <div className="dym-registry-title-block">
                  <span className="dym-registry-kicker">DANH MỤC TÀI KHOẢN</span>
                  <h2 id="staff-list-title" className="dym-registry-title">
                    Nhân Viên Phòng Khám DYM
                  </h2>
                  <p className="dym-registry-desc">
                    Quản lý tài khoản nhân viên, thiết lập vai trò tiếp nhận và phân công cơ sở hoạt động.
                  </p>
                </div>

                {/* Filter Tabs & Search Controls */}
                <div className="dym-registry-controls">
                  {/* Status Tabs */}
                  <div
                    className="dym-tab-group"
                    role="tablist"
                    aria-label="Lọc theo trạng thái tài khoản"
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
                      aria-selected={statusFilter === 'active'}
                      className={`dym-tab-btn is-called ${statusFilter === 'active' ? 'is-active' : ''}`}
                      onClick={() => setStatusFilter('active')}
                    >
                      <span className="dym-tab-dot-called" />
                      <span>Hoạt động</span>
                      <span className="dym-tab-badge">{tabCounts.active}</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={statusFilter === 'locked'}
                      className={`dym-tab-btn is-waiting ${statusFilter === 'locked' ? 'is-active' : ''}`}
                      onClick={() => setStatusFilter('locked')}
                    >
                      <span className="dym-tab-dot-waiting" />
                      <span>Đã khóa</span>
                      <span className="dym-tab-badge">{tabCounts.locked}</span>
                    </button>
                  </div>

                  {/* Search Field */}
                  <div className="dym-search-wrapper">
                    <label htmlFor={searchInputId} className="sr-only">
                      Tìm kiếm nhân viên
                    </label>
                    <div className="dym-search-input-box">
                      <MagnifyingGlassIcon className="dym-search-icon" aria-hidden="true" />
                      <input
                        id={searchInputId}
                        type="search"
                        className="dym-search-field"
                        placeholder="Tìm tên, tài khoản, chi nhánh..."
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

              {/* Data Table */}
              {isLoading ? (
                <div className="dym-table-empty-box" aria-live="polite">
                  <div className="page-loader-dots" aria-hidden="true" />
                  <h3 className="dym-empty-title">Đang tải danh sách nhân viên</h3>
                  <p className="dym-empty-desc">
                    Hệ thống đang đồng bộ dữ liệu bảo mật từ Supabase.
                  </p>
                </div>
              ) : filteredStaff.length === 0 ? (
                <div className="dym-table-empty-box">
                  <div className="dym-empty-icon-wrap">
                    <UserGroupIcon className="w-7 h-7 text-sky-600" aria-hidden="true" />
                  </div>
                  <h3 className="dym-empty-title">Không tìm thấy nhân viên</h3>
                  <p className="dym-empty-desc">
                    Không có tài khoản nào phù hợp với bộ lọc hiện tại. Hãy đổi từ khóa hoặc thêm nhân viên mới.
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
                        <th scope="col">Nhân Viên</th>
                        <th scope="col">Vai Trò</th>
                        <th scope="col">Cơ Sở Tiếp Nhận</th>
                        <th scope="col">Đăng Nhập Gần Nhất</th>
                        <th scope="col">Trạng Thái</th>
                        <th scope="col" className="text-right">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStaff.map((account) => (
                        <tr key={account.userId}>
                          {/* Staff Avatar + Name + Login */}
                          <td>
                            <div className="flex items-center gap-3">
                              <Avatar name={account.displayName} size="md" tooltip={false} />
                              <div className="dym-patient-info">
                                <span className="dym-patient-name">
                                  <HighlightText text={account.displayName} query={query} />
                                </span>
                                <span className="dym-patient-meta font-mono">
                                  @<HighlightText text={account.loginName || 'chưa_cài_tên'} query={query} />
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Role */}
                          <td>
                            <span
                              className={`dym-role-badge ${
                                account.role === 'admin'
                                  ? 'role-admin'
                                  : 'role-receptionist'
                              }`}
                            >
                              {account.role === 'admin' ? 'Quản trị viên' : 'Lễ tân'}
                            </span>
                          </td>

                          {/* Branches */}
                          <td>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {account.role === 'admin' && account.branches.length === 0 ? (
                                <span className="dym-branch-chip">Tất cả cơ sở</span>
                              ) : account.branches.length === 0 ? (
                                <span className="text-xs text-slate-400 italic">Chưa gán</span>
                              ) : (
                                account.branches.map((b) => (
                                  <span key={b.code} className="dym-branch-chip">
                                    {b.code.toUpperCase()}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>

                          {/* Last Sign In */}
                          <td>
                            <span className="dym-patient-meta font-mono text-xs">
                              {formatLastSignIn(account.lastSignInAt)}
                            </span>
                          </td>

                          {/* Status */}
                          <td>
                            <span
                              className={`dym-status-led-badge ${
                                account.isActive ? 'is-active' : 'is-locked'
                              }`}
                            >
                              <span className="dym-status-led-dot" />
                              {account.isActive ? 'Hoạt động' : 'Đã khóa'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="text-right">
                            <div className="dym-table-actions-group">
                              <button
                                type="button"
                                className="dym-btn-table-action action-edit"
                                onClick={() => openEditForm(account)}
                                title="Chỉnh sửa thông tin tài khoản"
                              >
                                <PencilSquareIcon className="w-3.5 h-3.5 text-sky-600" aria-hidden="true" />
                                <span>Sửa</span>
                              </button>

                              <button
                                type="button"
                                className="dym-btn-table-action action-key"
                                disabled={isResettingPassword}
                                onClick={() => openPasswordReset(account)}
                                title="Đặt lại mật khẩu cho tài khoản này"
                              >
                                <KeyIcon className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                                <span>Mật khẩu</span>
                              </button>

                              <button
                                type="button"
                                className={`dym-btn-table-action ${
                                  account.isActive ? 'action-lock' : 'action-unlock'
                                }`}
                                disabled={pendingAccountId === account.userId}
                                onClick={() => requestAccountActiveChange(account)}
                                title={account.isActive ? 'Khóa tài khoản này' : 'Mở khóa kích hoạt lại tài khoản'}
                              >
                                {account.isActive ? (
                                  <LockClosedIcon className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />
                                ) : (
                                  <LockOpenIcon className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                                )}
                                <span>
                                  {pendingAccountId === account.userId
                                    ? 'Đang lưu...'
                                    : account.isActive
                                      ? 'Khóa'
                                      : 'Mở khóa'}
                                </span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </main>
        </div>

        {/* Modal 1: Create / Edit Staff Form */}
        <StaffFormModal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          form={form}
          setForm={setForm}
          isSaving={isSaving}
          formError={formError}
          onSave={saveStaff}
          toggleBranch={toggleBranch}
        />

        {/* Modal 2: Confirm Account Lock */}
        <StaffLockConfirmModal
          account={accountPendingConfirmation}
          onClose={() => setAccountPendingConfirmation(null)}
          onConfirm={(account) => {
            setAccountPendingConfirmation(null);
            void setAccountActive(account);
          }}
          isPending={Boolean(pendingAccountId)}
        />

        {/* Modal 3: Password Reset */}
        <StaffPasswordResetModal
          account={passwordResetAccount}
          onClose={() => setPasswordResetAccount(null)}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          confirmedPassword={confirmedPassword}
          setConfirmedPassword={setConfirmedPassword}
          passwordResetError={passwordResetError}
          isResetting={isResettingPassword}
          onReset={resetPassword}
        />
      </div>
    </Theme>
  );
}

export default StaffPage;
