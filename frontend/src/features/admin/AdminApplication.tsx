import { getDefaultPermissions, hasPermission, type StaffPermissions } from '@/lib/staffPermissions';
import { StaffPermissionsContext, DESTINATION_PERMISSIONS } from './hooks/useStaffPermissions';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Theme } from '@astryxdesign/core/theme';
import dymLogoDark from '../../assets/dym-logo-dark.png';
import { supabase } from '../../lib/supabaseClient';
import AdminPage from './AdminPage';
import { useAdminTheme } from './hooks/useAdminTheme';
import RegistrationsPage from './RegistrationsPage';
import {
  RosterDashboardPage,
  RosterSettlementPage,
  RosterDataProvider,
  RosterInsitePage,
  RosterOnsitePage,
  RosterPersonnelPage,
} from './roster';
import StaffPage from './StaffPage';
import { dymAdminTheme } from './theme';
import type { StaffRole } from './types';

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

function AdminLoader() {
  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background text-foreground"
      role="status"
      aria-live="polite"
    >
      <img
        src={dymLogoDark}
        alt="DYM Medical Center"
        className="h-auto w-36 opacity-90"
      />
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
        <span>Đang tải không gian quản trị...</span>
      </div>
    </div>
  );
}

function AdminApplication({ destination }: { destination: AdminDestination }) {
  const initialDestination = useRef(destination);
  initialDestination.current = destination;
  const { themeMode } = useAdminTheme();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole>('receptionist');
  const [permissions, setPermissions] = useState<StaffPermissions>(getDefaultPermissions('none'));
  const isAdmin = staffRole === 'admin';
  const canAccessRoster = ['overview','clinic','onsite','settlement','personnel'].some((key) => permissions[key as keyof StaffPermissions]?.view);

  useEffect(() => {
    let isMounted = true;
    try {
      window.sessionStorage.removeItem('dym_registration_overrides_v1');
      window.localStorage.removeItem('dym_registration_overrides_v1');
      window.localStorage.removeItem('dym_tt25_customer_extras_v1');
    } catch { /* Server data is used even when browser storage is unavailable. */ }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) window.location.replace('/?page=login');
    });

    const verifyAccess = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.replace('/?page=login');
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

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

      if (isMounted) {
        setStaffRole(resolvedRole);
        setPermissions(resolvedPermissions);
        setIsAuthorized(true);
      }
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
          isActiveTab={destination === 'dashboard'}
        />
      </div>}

      {permissions.registrations.view && activeVisitedTabs.has('registrations') && (
        <div className={destination === 'registrations' ? 'contents' : 'hidden'}>
          <RegistrationsPage
            authorizedIsAdmin={isAdmin}
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
                <RosterDashboardPage authorizedIsAdmin={isAdmin} isActiveTab={destination === 'roster-dashboard'} />
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
