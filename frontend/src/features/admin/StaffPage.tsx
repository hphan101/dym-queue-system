import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  LockOpenIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Badge } from '@astryxdesign/core/Badge';
import { Theme } from '@astryxdesign/core/theme';
import { useEffect, useMemo, useState } from 'react';
import '@astryxdesign/core/astryx.css';
import { BRANCH_NAMES } from '../../config/branches';
import { getTodayInVietnam } from '../../lib/date';
import { supabase } from '../../lib/supabaseClient';
import type { BranchCode } from '../../types/domain';
import { AdminSidebar } from './AdminSidebar';
import {
  clearRememberedStaffName,
  getInitialStaffName,
  rememberStaffName,
} from './adminIdentity';
import {
  getCachedRegistrationCount,
  getLatestRegistrationScope,
} from './registrationCountCache';
import { dymAdminTheme } from './theme';
import './admin.css';
import './staff.css';

import { useAdminTheme } from './hooks/useAdminTheme';
import { useSidebarResponsive } from './hooks/useSidebarResponsive';
import { normalizeSearch } from './utils/adminFormatters';

type StaffRole = 'admin' | 'receptionist';

interface StaffBranch {
  code: BranchCode;
  name: string;
}

interface StaffAccount {
  userId: string;
  loginName: string;
  displayName: string;
  role: StaffRole;
  isActive: boolean;
  branches: StaffBranch[];
  createdAt: string;
  lastSignInAt: string | null;
}

interface StaffFormState {
  userId: string | null;
  displayName: string;
  loginName: string;
  password: string;
  role: StaffRole;
  branchCodes: BranchCode[];
}

interface StaffApiResponse {
  success: boolean;
  code?: string;
  staff?: StaffAccount[];
}

const BRANCH_CODES = Object.keys(BRANCH_NAMES) as BranchCode[];
const EMPTY_FORM: StaffFormState = {
  userId: null,
  displayName: '',
  loginName: '',
  password: '',
  role: 'receptionist',
  branchCodes: ['q1'],
};
let cachedStaffAccounts: StaffAccount[] | null = null;

function getInitialRegistrationScope() {
  return getLatestRegistrationScope() ?? {
    branch: 'q1' as BranchCode,
    date: getTodayInVietnam(),
  };
}

function formatDateTime(value: string | null) {
  if (!value) return 'Chưa đăng nhập';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function apiErrorMessage(code?: string) {
  switch (code) {
    case 'ACCOUNT_EXISTS':
      return 'Tài khoản này đã được sử dụng.';
    case 'SELF_ADMIN_PROTECTION':
      return 'Bạn không thể tự khóa hoặc tự hạ quyền quản trị của chính mình.';
    case 'INVALID_DATA':
      return 'Thông tin nhân viên chưa hợp lệ. Mật khẩu cần ít nhất 6 ký tự.';
    case 'ADMIN_REQUIRED':
      return 'Chỉ quản trị viên mới được quản lý nhân viên.';
    case 'STAFF_NOT_FOUND':
      return 'Không tìm thấy tài khoản nhân viên.';
    default:
      return 'Không thể thực hiện thao tác. Vui lòng thử lại.';
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
  const result = (await response.json()) as StaffApiResponse;
  if (!response.ok || !result.success) {
    throw new Error(result.code ?? 'REQUEST_FAILED');
  }
  return result;
}

function StaffPage() {
  const { themeMode, setThemeMode } = useAdminTheme();
  const { isSidebarCollapsed, setIsSidebarCollapsed } = useSidebarResponsive();
  const [staffName, setStaffName] = useState(getInitialStaffName);
  const [staff, setStaff] = useState<StaffAccount[]>(
    () => cachedStaffAccounts ?? [],
  );
  const [query, setQuery] = useState('');
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
  const [registrationScope] = useState(getInitialRegistrationScope);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Quản lý nhân viên | DYM Medical Center';
    return () => {
      document.title = previousTitle;
    };
  }, []);

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

  const filteredStaff = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return staff;
    return staff.filter((account) =>
      normalizeSearch(
        [
          account.displayName,
          account.loginName,
          account.role === 'admin' ? 'quản trị' : 'lễ tân',
          ...account.branches.map((branch) => branch.name),
        ].join(' '),
      ).includes(normalizedQuery),
    );
  }, [query, staff]);

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
      await loadStaff();
    } catch (requestError) {
      const code = requestError instanceof Error ? requestError.message : undefined;
      setFormError(apiErrorMessage(code));
    } finally {
      setIsSaving(false);
    }
  };

  const setAccountActive = async (account: StaffAccount) => {
    const nextActive = !account.isActive;

    setPendingAccountId(account.userId);
    setError(null);
    setSuccess(null);
    try {
      await requestStaffApi('POST', {
        action: 'set-active',
        userId: account.userId,
        isActive: nextActive,
      });
      setStaff((accounts) =>
        {
          const nextAccounts = accounts.map((current) =>
          current.userId === account.userId
            ? { ...current, isActive: nextActive }
            : current,
          );
          cachedStaffAccounts = nextAccounts;
          return nextAccounts;
        },
      );
      setSuccess(
        nextActive
          ? `Đã mở khóa ${account.displayName}.`
          : `Đã khóa ${account.displayName}.`,
      );
    } catch (requestError) {
      const code = requestError instanceof Error ? requestError.message : undefined;
      setError(apiErrorMessage(code));
    } finally {
      setPendingAccountId(null);
    }
  };

  const requestAccountActiveChange = (account: StaffAccount) => {
    if (!account.isActive) {
      void setAccountActive(account);
      return;
    }

    setAccountPendingConfirmation(account);
  };

  const openPasswordReset = (account: StaffAccount) => {
    setNewPassword('');
    setConfirmedPassword('');
    setPasswordResetError(null);
    setPasswordResetAccount(account);
  };

  const resetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordResetAccount) return;

    if (newPassword.length < 6) {
      setPasswordResetError('Mật khẩu mới cần có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmedPassword) {
      setPasswordResetError('Xác nhận mật khẩu chưa khớp.');
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
      setSuccess(`Đã đặt lại mật khẩu cho ${passwordResetAccount.displayName}.`);
      setPasswordResetAccount(null);
    } catch (requestError) {
      const code = requestError instanceof Error ? requestError.message : undefined;
      setPasswordResetError(apiErrorMessage(code));
    } finally {
      setIsResettingPassword(false);
    }
  };

  useEffect(() => {
    if (!accountPendingConfirmation) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingAccountId) {
        setAccountPendingConfirmation(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [accountPendingConfirmation, pendingAccountId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearRememberedStaffName();
    window.location.assign('/?page=login');
  };

  const activeCount = staff.filter((account) => account.isActive).length;
  const registrationCount =
    getCachedRegistrationCount(registrationScope.branch, registrationScope.date) ?? 0;

  return (
    <Theme theme={dymAdminTheme} mode={themeMode}>
      <div className="dym-admin-shell" data-color-mode={themeMode}>
        <AdminSidebar
          activePage="staff"
          branch={registrationScope.branch}
          registrationCount={registrationCount}
          staffName={staffName}
          isAdmin
          themeMode={themeMode}
          isCollapsed={isSidebarCollapsed}
          onCollapsedChange={setIsSidebarCollapsed}
          onThemeToggle={() =>
            setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))
          }
          onLogout={() => void handleLogout()}
        />

        <div className="dym-admin-workspace">
          <header className="dym-command-bar dym-staff-command-bar">
            <div className="dym-command-copy">
              <div className="dym-eyebrow-row">
                <span className="dym-eyebrow">Hệ thống</span>
                <Badge label="Chỉ quản trị viên" variant="info" />
              </div>
              <h1>Quản lý nhân viên</h1>
              <p>Tạo tài khoản, khóa truy cập và phân quyền theo chi nhánh.</p>
            </div>
            <button type="button" className="dym-staff-primary" onClick={openCreateForm}>
              <PlusIcon aria-hidden="true" />
              Thêm nhân viên
            </button>
          </header>

          <main className="dym-admin-content dym-staff-content">
            {error && <div className="dym-data-error" role="alert">{error}</div>}
            {success && (
              <div className="dym-staff-success" role="status">
                {success}
              </div>
            )}

            <section className="dym-staff-summary" aria-label="Tổng quan nhân viên">
              <div>
                <span>Tổng tài khoản</span>
                <strong>{staff.length}</strong>
              </div>
              <div>
                <span>Đang hoạt động</span>
                <strong>{activeCount}</strong>
              </div>
              <div>
                <span>Đã khóa</span>
                <strong>{staff.length - activeCount}</strong>
              </div>
            </section>

            <section className="dym-staff-panel" aria-labelledby="staff-list-title">
              <div className="dym-staff-toolbar">
                <div>
                  <span className="dym-eyebrow">Danh sách tài khoản</span>
                  <h2 id="staff-list-title">Nhân viên DYM</h2>
                </div>
                <label className="dym-staff-search">
                  <MagnifyingGlassIcon aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Tìm tên, tài khoản hoặc chi nhánh"
                    aria-label="Tìm nhân viên"
                  />
                </label>
                <button
                  type="button"
                  className="dym-staff-refresh"
                  aria-label="Làm mới danh sách nhân viên"
                  aria-busy={isLoading}
                  disabled={isLoading}
                  onClick={() => void loadStaff()}
                >
                  <ArrowPathIcon aria-hidden="true" />
                  {isLoading ? 'Đang tải' : 'Làm mới'}
                </button>
              </div>

              {isLoading ? (
                <div className="dym-staff-empty" aria-live="polite">
                  <div className="page-loader-dots" aria-hidden="true" />
                  <strong>Đang tải danh sách nhân viên</strong>
                </div>
              ) : filteredStaff.length === 0 ? (
                <div className="dym-staff-empty">
                  <UserGroupIcon aria-hidden="true" />
                  <strong>Không có nhân viên phù hợp</strong>
                  <span>Hãy đổi nội dung tìm kiếm hoặc thêm tài khoản mới.</span>
                </div>
              ) : (
                <div className="dym-staff-table-wrap">
                  <table className="dym-staff-table">
                    <thead>
                      <tr>
                        <th scope="col">Nhân viên</th>
                        <th scope="col">Vai trò</th>
                        <th scope="col">Chi nhánh</th>
                        <th scope="col">Đăng nhập gần nhất</th>
                        <th scope="col">Trạng thái</th>
                        <th scope="col"><span className="sr-only">Thao tác</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStaff.map((account) => (
                        <tr key={account.userId}>
                          <td>
                            <strong>{account.displayName}</strong>
                            <span>@{account.loginName || 'chưa có tài khoản'}</span>
                          </td>
                          <td>
                            {account.role === 'admin' ? 'Quản trị viên' : 'Lễ tân'}
                          </td>
                          <td>
                            <div className="dym-staff-branches">
                              {account.role === 'admin' && account.branches.length === 0 ? (
                                <span>Tất cả chi nhánh</span>
                              ) : (
                                account.branches.map((branch) => (
                                  <span key={branch.code}>{branch.code.toUpperCase()}</span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="dym-staff-secondary">
                            {formatDateTime(account.lastSignInAt)}
                          </td>
                          <td>
                            <span className="dym-staff-status" data-active={account.isActive}>
                              {account.isActive ? 'Hoạt động' : 'Đã khóa'}
                            </span>
                          </td>
                          <td>
                            <div className="dym-staff-actions">
                              <button
                                type="button"
                                onClick={() => openEditForm(account)}
                              >
                                <PencilSquareIcon aria-hidden="true" />
                                Sửa
                              </button>
                              <button
                                type="button"
                                disabled={isResettingPassword}
                                onClick={() => openPasswordReset(account)}
                              >
                                <KeyIcon aria-hidden="true" />
                                Đặt lại MK
                              </button>
                              <button
                                type="button"
                                data-danger={account.isActive}
                                disabled={pendingAccountId === account.userId}
                                onClick={() => requestAccountActiveChange(account)}
                              >
                                {account.isActive ? (
                                  <LockClosedIcon aria-hidden="true" />
                                ) : (
                                  <LockOpenIcon aria-hidden="true" />
                                )}
                                {pendingAccountId === account.userId
                                  ? 'Đang xử lý'
                                  : account.isActive
                                    ? 'Khóa'
                                    : 'Mở khóa'}
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

            <footer className="dym-admin-footer">
              <span>© 2026 DYM Medical Center</span>
              <span>Dữ liệu tài khoản chỉ hiển thị cho quản trị viên.</span>
            </footer>
          </main>
        </div>

        {isFormOpen && (
          <div className="dym-staff-dialog-backdrop" role="presentation">
            <section
              className="dym-staff-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="staff-form-title"
            >
              <header>
                <div>
                  <span className="dym-eyebrow">Tài khoản nhân viên</span>
                  <h2 id="staff-form-title">
                    {form.userId ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên'}
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Đóng"
                  disabled={isSaving}
                  onClick={() => setIsFormOpen(false)}
                >
                  <XMarkIcon aria-hidden="true" />
                </button>
              </header>

              <form onSubmit={(event) => void saveStaff(event)}>
                {formError && <div className="dym-staff-form-error" role="alert">{formError}</div>}

                <label>
                  <span>Họ và tên</span>
                  <input
                    type="text"
                    value={form.displayName}
                    maxLength={100}
                    required
                    autoFocus
                    onChange={(event) =>
                      setForm((current) => ({ ...current, displayName: event.target.value }))
                    }
                  />
                </label>

                <div className="dym-staff-form-grid">
                  <label>
                    <span>Tài khoản đăng nhập</span>
                    <input
                      type="text"
                      value={form.loginName}
                      maxLength={32}
                      required
                      autoComplete="username"
                      placeholder="vd: letan.q1"
                      onChange={(event) =>
                        setForm((current) => ({ ...current, loginName: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>Vai trò</span>
                    <select
                      value={form.role}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          role: event.target.value as StaffRole,
                        }))
                      }
                    >
                      <option value="receptionist">Lễ tân</option>
                      <option value="admin">Quản trị viên</option>
                    </select>
                  </label>
                </div>

                {!form.userId && (
                  <label>
                    <span>Mật khẩu tạm thời</span>
                    <input
                      type="password"
                      value={form.password}
                      minLength={6}
                      maxLength={72}
                      required
                      autoComplete="new-password"
                      onChange={(event) =>
                        setForm((current) => ({ ...current, password: event.target.value }))
                      }
                    />
                    <small>Tối thiểu 6 ký tự. Gửi mật khẩu cho nhân viên qua kênh riêng.</small>
                  </label>
                )}

                <fieldset>
                  <legend>Chi nhánh được truy cập</legend>
                  <div className="dym-staff-branch-options">
                    {BRANCH_CODES.map((branchCode) => (
                      <label key={branchCode}>
                        <input
                          type="checkbox"
                          checked={form.branchCodes.includes(branchCode)}
                          onChange={() => toggleBranch(branchCode)}
                        />
                        <span>
                          <strong>{branchCode.toUpperCase()}</strong>
                          {BRANCH_NAMES[branchCode]}
                        </span>
                      </label>
                    ))}
                  </div>
                  {form.role === 'admin' && (
                    <small>Quản trị viên luôn có quyền truy cập tất cả chi nhánh.</small>
                  )}
                </fieldset>

                <footer>
                  <button
                    type="button"
                    className="dym-staff-secondary-button"
                    disabled={isSaving}
                    onClick={() => setIsFormOpen(false)}
                  >
                    Hủy
                  </button>
                  <button type="submit" className="dym-staff-primary" disabled={isSaving}>
                    {isSaving ? 'Đang lưu…' : form.userId ? 'Lưu thay đổi' : 'Tạo tài khoản'}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}

        {accountPendingConfirmation && (
          <div className="dym-staff-dialog-backdrop" role="presentation">
            <section
              className="dym-staff-dialog dym-staff-confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="staff-lock-confirmation-title"
              aria-describedby="staff-lock-confirmation-description"
            >
              <div className="dym-staff-confirm-icon" aria-hidden="true">
                <ExclamationTriangleIcon />
              </div>
              <div>
                <span className="dym-eyebrow">Xác nhận thao tác</span>
                <h2 id="staff-lock-confirmation-title">Khóa tài khoản?</h2>
                <p id="staff-lock-confirmation-description">
                  Khóa tài khoản <strong>{accountPendingConfirmation.displayName}</strong>.
                  Nhân viên sẽ không thể đăng nhập cho đến khi bạn mở khóa lại.
                </p>
              </div>
              <footer>
                <button
                  type="button"
                  className="dym-staff-secondary-button"
                  disabled={Boolean(pendingAccountId)}
                  autoFocus
                  onClick={() => setAccountPendingConfirmation(null)}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="dym-staff-confirm-danger"
                  disabled={Boolean(pendingAccountId)}
                  onClick={() => {
                    const account = accountPendingConfirmation;
                    setAccountPendingConfirmation(null);
                    void setAccountActive(account);
                  }}
                >
                  <LockClosedIcon aria-hidden="true" />
                  {pendingAccountId ? 'Đang khóa' : 'Khóa tài khoản'}
                </button>
              </footer>
            </section>
          </div>
        )}

        {passwordResetAccount && (
          <div className="dym-staff-dialog-backdrop" role="presentation">
            <section
              className="dym-staff-dialog dym-staff-password-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="staff-password-reset-title"
            >
              <header>
                <div>
                  <span className="dym-eyebrow">Bảo mật tài khoản</span>
                  <h2 id="staff-password-reset-title">Đặt lại mật khẩu</h2>
                </div>
                <button
                  type="button"
                  aria-label="Đóng"
                  disabled={isResettingPassword}
                  onClick={() => setPasswordResetAccount(null)}
                >
                  <XMarkIcon aria-hidden="true" />
                </button>
              </header>
              <form onSubmit={(event) => void resetPassword(event)}>
                <p className="dym-staff-password-note">
                  Đặt mật khẩu mới cho <strong>{passwordResetAccount.displayName}</strong>. Mật khẩu cũ sẽ không còn dùng được.
                </p>
                {passwordResetError && (
                  <div className="dym-staff-form-error" role="alert">{passwordResetError}</div>
                )}
                <label>
                  <span>Mật khẩu mới</span>
                  <input
                    type="password"
                    value={newPassword}
                    minLength={6}
                    maxLength={72}
                    required
                    autoFocus
                    autoComplete="new-password"
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                  <small>Tối thiểu 6 ký tự. Gửi mật khẩu cho nhân viên qua kênh riêng.</small>
                </label>
                <label>
                  <span>Xác nhận mật khẩu mới</span>
                  <input
                    type="password"
                    value={confirmedPassword}
                    minLength={6}
                    maxLength={72}
                    required
                    autoComplete="new-password"
                    onChange={(event) => setConfirmedPassword(event.target.value)}
                  />
                </label>
                <footer>
                  <button
                    type="button"
                    className="dym-staff-secondary-button"
                    disabled={isResettingPassword}
                    onClick={() => setPasswordResetAccount(null)}
                  >
                    Hủy
                  </button>
                  <button type="submit" className="dym-staff-primary" disabled={isResettingPassword}>
                    {isResettingPassword ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}
      </div>
    </Theme>
  );
}

export default StaffPage;
