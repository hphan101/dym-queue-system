import { getDefaultPermissions, hasPermission, type StaffPermissions } from '@/lib/staffPermissions';
import { Theme } from '@astryxdesign/core/theme';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import StaffPage from './accounts/StaffPage';
import type { StaffRole } from './accounts/types';
import AdminPage from './reception/AdminPage';
import RegistrationsPage from './registrations/RegistrationsPage';
import {
  RosterDashboardPage,
  RosterDataProvider,
  RosterInsitePage,
  RosterOnsitePage,
  RosterPersonnelPage,
  RosterSettlementPage,
} from './roster';
import { DESTINATION_PERMISSIONS, StaffPermissionsContext } from './shared/useStaffPermissions';
import { fetchStaffBranches, type StaffIdentity } from './shared/useStaffIdentity';
import { getInitialStaffName, rememberStaffName } from './shared/adminIdentity';
import { AdminLoader } from './shell/AdminLoader';
import './shell/adminLoader.css';
import { dymAdminTheme } from './shell/theme';
import { useAdminTheme } from './shell/useAdminTheme';

export type AdminDestination =
  | 'dashboard'
  | 'registrations'
  | 'roster-dashboard'
  | 'roster-settlement'
  | 'roster-insite'
  | 'roster-onsite'
  | 'roster-personnel'
  | 'staff';

function isDestinationAllowed(destination: AdminDestination, permissions: StaffPermissions): boolean {
  return hasPermission('', permissions, DESTINATION_PERMISSIONS[destination]);
}



function AdminApplication({ destination }: { destination: AdminDestination }) {
  const initialDestination = useRef(destination);
  initialDestination.current = destination;
  const { themeMode } = useAdminTheme();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [staffIdentity, setStaffIdentity] = useState<StaffIdentity>(() => ({
    staffName: getInitialStaffName(),
    staffRole: 'receptionist',
    branchIds: {},
    isLoadingIdentity: true,
    identityError: null,
  }));
  const [permissions, setPermissions] = useState<StaffPermissions>(getDefaultPermissions('none'));
  const isAdmin = staffIdentity.staffRole === 'admin';
  const canAccessRoster = ['overview', 'clinic', 'onsite', 'settlement', 'personnel'].some((key) => permissions[key as keyof StaffPermissions]?.view);

  useEffect(() => {
    let isMounted = true;
    let verification = 0;
    try {
      window.sessionStorage.removeItem('dym_registration_overrides_v1');
      window.localStorage.removeItem('dym_registration_overrides_v1');
      window.localStorage.removeItem('dym_tt25_customer_extras_v1');
    } catch { /* Server data is used even when browser storage is unavailable. */ }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        verification += 1;
        window.location.replace('/?page=login');
      }
    });

    const verifyAccess = async () => {
      const attempt = ++verification;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted || attempt !== verification) return;
      if (!user) {
        window.location.replace('/?page=login');
        return;
      }

      const [{ data: profile, error }, branches] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        fetchStaffBranches(user.id).catch(() => null),
      ]);

      if (!isMounted || attempt !== verification) return;
      if (error || !profile?.is_active) {
        await supabase.auth.signOut();
        window.location.replace('/?page=login');
        return;
      }

      const resolvedRole: StaffRole =
        profile.role === 'admin' || profile.role === 'operator'
          ? profile.role
          : 'receptionist';

      const resolvedPermissions: StaffPermissions = profile.permissions ?? getDefaultPermissions(resolvedRole);
      if (!isDestinationAllowed(initialDestination.current, resolvedPermissions)) {
        const fallback = Object.keys(DESTINATION_PERMISSIONS).find((key) => resolvedPermissions[DESTINATION_PERMISSIONS[key]].view);
        if (fallback) { window.location.replace('/?page=' + (fallback === 'dashboard' ? 'admin' : fallback)); return; }
      }

      const staffName = profile.display_name || getInitialStaffName();
      if (profile.display_name) rememberStaffName(staffName);
      setStaffIdentity({
        staffName,
        staffRole: resolvedRole,
        branchIds: (resolvedRole === 'admin' && profile.permissions == null ? branches?.all : branches?.assigned) ?? {},
        isLoadingIdentity: false,
        identityError: branches ? null : 'Không thể tải danh sách chi nhánh.',
      });
      setPermissions(resolvedPermissions);
      setIsAuthorized(true);
    };

    void verifyAccess();
    const refreshAccess = () => { void verifyAccess(); };
    window.addEventListener('focus', refreshAccess);
    return () => {
      isMounted = false;
      subscription.unsubscribe();
      window.removeEventListener('focus', refreshAccess);
    };
  }, []);

  const [visitedTabs, setVisitedTabs] = useState<Set<AdminDestination>>(
    () => new Set([destination]),
  );

  // Synchronously include current destination on the very first render frame
  // so switching to an unvisited tab never paints a blank/black frame.
  const activeVisitedTabs = useMemo(() => {
    if (visitedTabs.has(destination)) return visitedTabs;
    const next = new Set(visitedTabs);
    next.add(destination);
    return next;
  }, [visitedTabs, destination]);

  useEffect(() => {
    if (isAuthorized && !isDestinationAllowed(destination, permissions)) {
      const fallback = Object.keys(DESTINATION_PERMISSIONS).find((key) => permissions[DESTINATION_PERMISSIONS[key]].view);
      if (fallback) window.location.replace('/?page=' + (fallback === 'dashboard' ? 'admin' : fallback));
      return;
    }

    setVisitedTabs((prev) => {
      if (prev.has(destination)) return prev;
      const next = new Set(prev);
      next.add(destination);
      return next;
    });
  }, [destination, isAuthorized, permissions]);

  if (!isAuthorized) return <AdminLoader />;
  if (!isDestinationAllowed(destination, permissions)) return <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center"><p>Tài khoản chưa được cấp quyền cho chức năng này. Vui lòng liên hệ quản trị viên.</p><button type="button" onClick={() => void supabase.auth.signOut()}>Đăng xuất</button></div>;

  return (
    <StaffPermissionsContext.Provider value={permissions}><Theme theme={dymAdminTheme} mode={themeMode}>
      {permissions.reception.view && <div className={destination === 'dashboard' ? 'contents' : 'hidden'}>
        <AdminPage
          authorizedIsAdmin={isAdmin}
          staffIdentity={staffIdentity}
          isActiveTab={destination === 'dashboard'}
        />
      </div>}

      {permissions.registrations.view && activeVisitedTabs.has('registrations') && (
        <div className={destination === 'registrations' ? 'contents' : 'hidden'}>
          <RegistrationsPage
            authorizedIsAdmin={isAdmin}
            staffIdentity={staffIdentity}
            isActiveTab={destination === 'registrations'}
          />
        </div>
      )}

      {canAccessRoster &&
        (activeVisitedTabs.has('roster-dashboard') ||
          activeVisitedTabs.has('roster-settlement') ||
          activeVisitedTabs.has('roster-insite') ||
          activeVisitedTabs.has('roster-onsite') ||
          (permissions.personnel.view && activeVisitedTabs.has('roster-personnel'))) && (
          <RosterDataProvider>
            {permissions.overview.view && activeVisitedTabs.has('roster-dashboard') && (
              <div
                className={
                  destination === 'roster-dashboard' ? 'contents' : 'hidden'
                }
              >
                <RosterDashboardPage
                  authorizedIsAdmin={isAdmin}
                  isActiveTab={destination === 'roster-dashboard'}
                  branchIds={staffIdentity.branchIds}
                />
              </div>
            )}

            {permissions.settlement.view && activeVisitedTabs.has('roster-settlement') && (
              <div className={destination === 'roster-settlement' ? 'contents' : 'hidden'}>
                <RosterSettlementPage authorizedIsAdmin={isAdmin} isActiveTab={destination === 'roster-settlement'} />
              </div>
            )}

            {permissions.clinic.view && activeVisitedTabs.has('roster-insite') && (
              <div
                className={destination === 'roster-insite' ? 'contents' : 'hidden'}
              >
                <RosterInsitePage authorizedIsAdmin={isAdmin} />
              </div>
            )}

            {permissions.onsite.view && activeVisitedTabs.has('roster-onsite') && (
              <div
                className={destination === 'roster-onsite' ? 'contents' : 'hidden'}
              >
                <RosterOnsitePage authorizedIsAdmin={isAdmin} />
              </div>
            )}

            {permissions.personnel.view && activeVisitedTabs.has('roster-personnel') && (
              <div
                className={
                  destination === 'roster-personnel' ? 'contents' : 'hidden'
                }
              >
                <RosterPersonnelPage authorizedIsAdmin={isAdmin} />
              </div>
            )}
          </RosterDataProvider>
        )}

      {permissions.staff.view && activeVisitedTabs.has('staff') && (
        <div className={destination === 'staff' ? 'contents' : 'hidden'}>
          <StaffPage isActiveTab={destination === 'staff'} />
        </div>
      )}
    </Theme></StaffPermissionsContext.Provider>
  );
}

export default AdminApplication;
