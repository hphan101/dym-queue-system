import { NumberedPagination } from '@/components/numbered-pagination';
import { getDefaultPermissions } from '@/lib/staffPermissions';
import { Avatar } from '@astryxdesign/core/Avatar';
import {
ArrowPathIcon,
PlusIcon,
} from '@heroicons/react/24/outline';
import { KeyRound,LoaderCircle,Lock,LockOpen,Pencil,Search,Trash2,X } from 'lucide-react';
import { useEffect,useId,useMemo,useState } from 'react';
import { FeedbackBanner } from '../shared/FeedbackBanner';
import { AdminLayout } from '../shell/AdminLayout';
import { apiErrorMessage,requestStaffApi } from './staffApi';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs,TabsList,TabsTrigger } from '@/components/ui/tabs';
import { PermissionButton as Button } from '@/features/admin/shared/PermissionButton';

import { supabase } from '../../../lib/supabaseClient';
import type { BranchCode } from '../../../types/domain';

import { getInitialStaffName,rememberStaffName } from '../shared/adminIdentity';

import '../shared/reception.css';
import '../shell/admin.css';
import './staff.css';

import { formatDateTime,normalizeSearch } from '../shared/adminFormatters';
import { HighlightText } from '../shared/HighlightText';
import { useAdminScope } from '../shared/useAdminScope';
import { AdminHeader } from '../shell/AdminHeader';
import { StaffDeleteConfirmModal } from './StaffDeleteConfirmModal';
import { StaffFormModal } from './StaffFormModal';
import { StaffLockConfirmModal } from './StaffLockConfirmModal';
import { StaffPasswordResetModal } from './StaffPasswordResetModal';
import type { StaffAccount,StaffFormState,StaffStatusTab } from './types';



const EMPTY_FORM: StaffFormState = {
  permissions: getDefaultPermissions('none'),
  canEditRosterHistory: false,
  userId: null,
  displayName: '',
  loginName: '',
  password: '',
  role: '',
  branchCodes: ['q1'],
};
let cachedStaffAccounts: StaffAccount[] | null = null;

function formatLastSignIn(value: string | null) {
  return value ? formatDateTime(value) : 'Chưa đăng nhập';
}







export function StaffPage({
  isActiveTab = true,
}: {
  isActiveTab?: boolean;
} = {}) {
  const { branch: scopeBranch, date: scopeDate } = useAdminScope();
  const [staffName, setStaffName] = useState(getInitialStaffName);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffAccount[]>(
    () => cachedStaffAccounts ?? [],
  );
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StaffStatusTab>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(cachedStaffAccounts === null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [bannerTick, setBannerTick] = useState(0);

  const showError = (message: string | null) => {
    setError(message);
    if (message) setBannerTick((tick) => tick + 1);
  };

  const showSuccess = (message: string | null) => {
    setSuccess(message);
    if (message) setBannerTick((tick) => tick + 1);
  };
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<StaffFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [accountPendingConfirmation, setAccountPendingConfirmation] =
    useState<StaffAccount | null>(null);
  const [accountPendingDeletion, setAccountPendingDeletion] =
    useState<StaffAccount | null>(null);
  const [passwordResetAccount, setPasswordResetAccount] =
    useState<StaffAccount | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmedPassword, setConfirmedPassword] = useState('');
  const [passwordResetError, setPasswordResetError] = useState<string | null>(
    null,
  );
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const searchInputId = useId();

  useEffect(() => {
    if (!isActiveTab) return;
    document.title = 'Quản lý tài khoản | DYM Medical Center';
  }, [isActiveTab]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => {
      setSuccess(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [success, bannerTick]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => {
      setError(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [error, bannerTick]);

  useEffect(() => {
    if (!formError || formError.includes('Cần cập nhật database')) return;
    const timer = window.setTimeout(() => {
      setFormError(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [formError]);

  useEffect(() => {
    if (!passwordResetError) return;
    const timer = window.setTimeout(() => {
      setPasswordResetError(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [passwordResetError]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.id) {
        setCurrentUserId(data.session.user.id);
      }
    });
  }, []);

  const loadStaff = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('AUTH_REQUIRED');
      setCurrentUserId(user.id);

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
      const code =
        requestError instanceof Error ? requestError.message : undefined;
      showError(apiErrorMessage(code));
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
        account.role === 'admin'
          ? 'quản trị'
          : account.role === 'operator'
            ? 'vận hành'
            : 'lễ tân',
        ...account.branches.map((b) => b.name),
      ].join(' ');

      return normalizeSearch(searchable).includes(normalizedQuery);
    });
  }, [query, staff, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / pageSize));
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (visiblePage - 1) * pageSize;
  const paginatedStaff = filteredStaff.slice(pageStartIndex, pageStartIndex + pageSize);
  useEffect(() => {
    setCurrentPage(1);
  }, [query, statusFilter]);

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
      canEditRosterHistory: account.canEditRosterHistory ?? false,
      permissions: account.permissions ?? getDefaultPermissions(account.role),
      branchCodes: account.branches.length ? account.branches.map((branch) => branch.code) : account.role === 'admin' ? ['q1', 'q7', 'hn'] : [],
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

    if (!form.role) {
      setFormError('Vui lòng chọn vai trò cho tài khoản.');
      return;
    }

    if (
      form.displayName.trim().length < 2 ||
      !/^[a-z0-9][a-z0-9._-]{2,31}$/i.test(form.loginName.trim()) ||
      (!form.userId && form.password.length < 6) ||
      form.branchCodes.length === 0
    ) {
      setFormError(
        'Vui lòng nhập đủ thông tin, mật khẩu từ 6 ký tự và chọn ít nhất một chi nhánh cho tài khoản.',
      );
      return;
    }

    setIsSaving(true);
    try {
      const capabilities = await requestStaffApi('GET');
      if (capabilities.permissionSchemaVersion !== 1) throw new Error('PERMISSION_API_NOT_READY');
      if (form.userId) {
        await requestStaffApi('POST', {
          action: 'update',
          userId: form.userId,
          displayName: form.displayName,
          loginName: form.loginName,
          role: form.role,
          branchCodes: form.branchCodes,
          canEditRosterHistory: form.canEditRosterHistory,
          permissions: form.permissions,
        });
        showSuccess(`Đã cập nhật ${form.displayName.trim()}.`);
      } else {
        await requestStaffApi('POST', {
          action: 'create',
          loginName: form.loginName,
          password: form.password,
          displayName: form.displayName,
          role: form.role,
          branchCodes: form.branchCodes,
          canEditRosterHistory: form.canEditRosterHistory,
          permissions: form.permissions,
        });
        showSuccess(`Đã tạo tài khoản cho ${form.displayName.trim()}.`);
      }
      setIsFormOpen(false);
      await loadStaff(false);
    } catch (requestError) {
      const code =
        requestError instanceof Error ? requestError.message : undefined;
      setFormError(apiErrorMessage(code));
    } finally {
      setIsSaving(false);
    }
  };

  const setAccountActive = async (account: StaffAccount) => {
    const nextIsActive = !account.isActive;
    let activeActorId = currentUserId;
    if (!activeActorId) {
      const { data } = await supabase.auth.getSession();
      activeActorId = data.session?.user?.id ?? null;
      if (activeActorId) setCurrentUserId(activeActorId);
    }

    if (!nextIsActive && activeActorId && account.userId === activeActorId) {
      showSuccess(null);
      showError(apiErrorMessage('SELF_ADMIN_PROTECTION'));
      return;
    }

    const previousStaff = staff;
    const optimisticStaff = staff.map((item) =>
      item.userId === account.userId
        ? { ...item, isActive: nextIsActive }
        : item,
    );

    setPendingAccountId(account.userId);
    showError(null);
    cachedStaffAccounts = optimisticStaff;
    setStaff(optimisticStaff);
    showSuccess(
      `Đã ${account.isActive ? 'khóa' : 'mở khóa'} tài khoản ${account.displayName}.`,
    );

    try {
      await requestStaffApi('POST', {
        action: 'set-active',
        userId: account.userId,
        isActive: nextIsActive,
      });
    } catch (requestError) {
      cachedStaffAccounts = previousStaff;
      setStaff(previousStaff);
      showSuccess(null);
      const code =
        requestError instanceof Error ? requestError.message : undefined;
      showError(apiErrorMessage(code));
    } finally {
      setPendingAccountId(null);
    }
  };

  const requestAccountActiveChange = (account: StaffAccount) => {
    if (account.isActive) {
      if (currentUserId && account.userId === currentUserId) {
        showSuccess(null);
        showError(apiErrorMessage('SELF_ADMIN_PROTECTION'));
        return;
      }
      setAccountPendingConfirmation(account);
      return;
    }
    void setAccountActive(account);
  };

  const deleteStaffAccount = async (account: StaffAccount) => {
    let activeActorId = currentUserId;
    if (!activeActorId) {
      const { data } = await supabase.auth.getSession();
      activeActorId = data.session?.user?.id ?? null;
      if (activeActorId) setCurrentUserId(activeActorId);
    }

    if (activeActorId && account.userId === activeActorId) {
      showSuccess(null);
      showError(apiErrorMessage('SELF_ADMIN_PROTECTION'));
      return;
    }

    const previousStaff = staff;
    const optimisticStaff = staff.filter(
      (item) => item.userId !== account.userId,
    );

    setPendingAccountId(account.userId);
    showError(null);
    cachedStaffAccounts = optimisticStaff;
    setStaff(optimisticStaff);
    showSuccess(`Đã xóa tài khoản ${account.displayName}.`);

    try {
      await requestStaffApi('POST', {
        action: 'delete',
        userId: account.userId,
      });
    } catch (requestError) {
      cachedStaffAccounts = previousStaff;
      setStaff(previousStaff);
      showSuccess(null);
      const code =
        requestError instanceof Error ? requestError.message : undefined;
      showError(apiErrorMessage(code));
    } finally {
      setPendingAccountId(null);
    }
  };

  const requestAccountDelete = (account: StaffAccount) => {
    if (currentUserId && account.userId === currentUserId) {
      showSuccess(null);
      showError(apiErrorMessage('SELF_ADMIN_PROTECTION'));
      return;
    }
    setAccountPendingDeletion(account);
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
      showSuccess(`Đã đổi mật khẩu cho ${passwordResetAccount.displayName}.`);
      setPasswordResetAccount(null);
    } catch (requestError) {
      const code =
        requestError instanceof Error ? requestError.message : undefined;
      setPasswordResetError(apiErrorMessage(code));
    } finally {
      setIsResettingPassword(false);
    }
  };

  return (
    <AdminLayout
      activePage="staff"
      branch={scopeBranch}
      date={scopeDate}
      staffName={staffName}
      isAdmin={true}
      className="dym-staff-page"
      overlays={
        <>
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
          {/* Modal 3: Confirm Account Deletion */}
          <StaffDeleteConfirmModal
            account={accountPendingDeletion}
            onClose={() => setAccountPendingDeletion(null)}
            onConfirm={(account) => {
              setAccountPendingDeletion(null);
              void deleteStaffAccount(account);
            }}
            isPending={Boolean(pendingAccountId)}
          />
          {/* Modal 4: Password Reset */}
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
        </>
      }
    >
      {/* Unified Clinical Precision Header */}
      <AdminHeader
        title="Quản lý tài khoản"
        actions={
          <div className="flex items-center gap-2">
            <Button permissionAction="create"
              type="button"
              size="sm"
              onClick={openCreateForm}
              title="Thêm tài khoản nhân viên mới"
              className="h-9 gap-2 px-3 text-sm font-medium shadow-none"
            >
              <PlusIcon className="size-3.5 shrink-0" />
              <span>Thêm nhân viên</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={() => void loadStaff()}
              title="Làm mới danh sách nhân viên (F5)"
              className="h-9 gap-2 bg-card px-3 text-sm font-medium shadow-none"
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

      <main className="dym-admin-content dym-reception-page dym-staff-content">
        {error && (
          <FeedbackBanner variant="destructive" message={error} onDismiss={() => setError(null)} />
        )}
        {success && (
          <FeedbackBanner variant="success" message={success} onDismiss={() => setSuccess(null)} />
        )}

        {/* Precision Table Panel */}
        <section
          className="dym-registry-panel"
          aria-labelledby="staff-list-title"
        >
          {/* Toolbar with Title Header + shadcn/ui Filter & Search Controls */}
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
            <div className="dym-registry-title-block">
              <h2 id="staff-list-title" className="dym-registry-title">
                Danh sách tài khoản nhân viên
              </h2>
            </div>

            {/* Filter Tabs & Search Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Status Tabs (shadcn Tabs + Badge) */}
              <Tabs
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as StaffStatusTab)
                }
              >
                <TabsList
                  aria-label="Lọc theo trạng thái tài khoản"
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
                    value="active"
                    className="h-7 gap-1.5 px-3 text-xs font-medium"
                  >
                    <span
                      className="size-1.5 rounded-full bg-current"
                      aria-hidden="true"
                    />
                    <span>Hoạt động</span>
                    <Badge
                      variant="secondary"
                      className="h-5 min-w-5 justify-center rounded-full bg-foreground/[0.06] px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground shadow-none group-data-[state=active]:bg-muted group-data-[state=active]:text-foreground"
                    >
                      {tabCounts.active}
                    </Badge>
                  </TabsTrigger>

                  <TabsTrigger
                    value="locked"
                    className="h-7 gap-1.5 px-3 text-xs font-medium"
                  >
                    <span
                      className="size-1.5 rounded-full bg-current"
                      aria-hidden="true"
                    />
                    <span>Đã khóa</span>
                    <Badge
                      variant="secondary"
                      className="h-5 min-w-5 justify-center rounded-full bg-foreground/[0.06] px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground shadow-none group-data-[state=active]:bg-muted group-data-[state=active]:text-foreground"
                    >
                      {tabCounts.locked}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Search Field (shadcn Input + Clear Button / Kbd) */}
              <div className="relative w-full sm:w-64 lg:w-72">
                <label htmlFor={searchInputId} className="sr-only">
                  Tìm kiếm nhân viên
                </label>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id={searchInputId}
                  type="search"
                  placeholder="Tìm tên, tài khoản, chi nhánh..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="dym-search-field h-10 bg-card pl-8 pr-8 text-sm shadow-none"
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
                    className="pointer-events-none absolute right-2 top-1/2 inline-flex h-5 -translate-y-1/2 select-none items-center rounded border border-border bg-muted px-1.5 text-xs font-medium text-muted-foreground"
                    title="Phím tắt: /"
                  >
                    /
                  </kbd>
                )}
              </div>
            </div>
          </div>

          {/* Data Table */}
          {isLoading ? (
            <div
              className="dym-table-scroller"
              aria-busy="true"
              aria-live="polite"
              aria-label="Đang tải danh sách nhân viên"
            >
              <table className="dym-table-precision">
                <thead>
                  <tr>
                    <th scope="col">Nhân Viên</th>
                    <th scope="col">Vai Trò</th>
                    <th scope="col">Cơ Sở Tiếp Nhận</th>
                    <th scope="col">Đăng Nhập Gần Nhất</th>
                    <th scope="col">Trạng Thái</th>
                    <th scope="col" className="text-right">
                      Thao Tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-9 shrink-0 rounded-full" />
                          <div className="flex flex-col gap-1.5">
                            <Skeleton className="h-4 w-36" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      </td>
                      <td>
                        <Skeleton className="h-5 w-24 rounded-md" />
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Skeleton className="h-5 w-12 rounded-md" />
                          <Skeleton className="h-5 w-12 rounded-md" />
                        </div>
                      </td>
                      <td>
                        <Skeleton className="h-3.5 w-28" />
                      </td>
                      <td>
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </td>
                      <td className="text-right">
                        <div className="dym-table-actions-group">
                          <Skeleton className="h-7 w-14 rounded-md" />
                          <Skeleton className="h-7 w-20 rounded-md" />
                          <Skeleton className="h-7 w-16 rounded-md" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="dym-table-empty-box" role="status">
              <h3 className="dym-empty-title">Không tìm thấy nhân viên</h3>
              <p className="dym-empty-desc">
                Không có tài khoản nào phù hợp với bộ lọc hiện tại. Hãy đổi từ
                khóa hoặc thêm nhân viên mới.
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
                    <th scope="col">Nhân viên</th>
                    <th scope="col">Vai trò</th>
                    <th scope="col">Chi nhánh</th>
                    <th scope="col">Đăng nhập gần nhất</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col" className="text-right">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStaff.map((account) => (
                    <tr key={account.userId}>
                      {/* Staff Avatar + Name + Login */}
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar
                            className="dym-staff-avatar"
                            name={account.displayName}
                            size="md"
                            tooltip={false}
                          />
                          <div className="dym-patient-info">
                            <span className="dym-patient-name">
                              <HighlightText
                                text={account.displayName}
                                query={query}
                              />
                            </span>
                            <span className="dym-patient-meta tabular-nums">
                              @
                              <HighlightText
                                text={account.loginName || 'chưa_cài_tên'}
                                query={query}
                              />
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td>
                        <Badge variant={account.role === 'admin' ? 'success' : account.role === 'operator' ? 'warning' : 'secondary'}>
                          {account.role === 'admin'
                            ? 'Quản trị viên'
                            : account.role === 'operator'
                              ? 'Vận hành'
                              : 'Lễ tân'}
                        </Badge>
                      </td>

                      {/* Branches */}
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {account.role === 'admin' &&
                            account.branches.length === 0 ? (
                            <span className="dym-branch-chip">
                              Tất cả cơ sở
                            </span>
                          ) : account.branches.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              Chưa gán
                            </span>
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
                        <span className="dym-patient-meta tabular-nums text-xs">
                          {formatLastSignIn(account.lastSignInAt)}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <Badge variant={account.isActive ? 'success' : 'destructive'}>
                          {account.isActive ? 'Hoạt động' : 'Đã khóa'}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="text-right">
                        <div className="dym-table-actions-group">
                          <Button permissionAction="update"
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditForm(account)}
                            title="Chỉnh sửa thông tin tài khoản"
                            aria-label={`Chỉnh sửa ${account.displayName}`}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>

                          <Button permissionAction="update"
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={isResettingPassword}
                            onClick={() => openPasswordReset(account)}
                            title="Đặt lại mật khẩu cho tài khoản này"
                            aria-label={`Đặt lại mật khẩu cho ${account.displayName}`}
                          >
                            <KeyRound aria-hidden="true" />
                          </Button>

                          <Button permissionAction="update"
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={pendingAccountId === account.userId}
                            onClick={() => requestAccountActiveChange(account)}
                            title={
                              account.isActive
                                ? 'Khóa tài khoản này'
                                : 'Mở khóa kích hoạt lại tài khoản'
                            }
                            aria-label={`${account.isActive ? 'Khóa' : 'Mở khóa'} ${account.displayName}`}
                            aria-busy={pendingAccountId === account.userId}
                          >
                            {pendingAccountId === account.userId
                              ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
                              : account.isActive
                                ? <Lock aria-hidden="true" />
                                : <LockOpen aria-hidden="true" />}
                          </Button>

                          <Button permissionAction="delete"
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={pendingAccountId === account.userId}
                            onClick={() => requestAccountDelete(account)}
                            title="Xóa tài khoản này"
                            aria-label={`Xóa ${account.displayName}`}
                            className="dym-staff-delete-button"
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!isLoading && filteredStaff.length > 0 && (
            <div className="dym-pagination-bar">
              <span className="dym-pagination-summary">Hiển thị {pageStartIndex + 1}–{Math.min(pageStartIndex + pageSize, filteredStaff.length)} trong {filteredStaff.length} nhân viên</span>
              <NumberedPagination currentPage={visiblePage} totalPages={totalPages} onPageChange={setCurrentPage} pageSize={pageSize} onPageSizeChange={setPageSize} label="Phân trang nhân viên" />
            </div>
          )}
        </section>
      </main>
    </AdminLayout>
  );
}

export default StaffPage;
