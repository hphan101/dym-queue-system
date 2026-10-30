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
  | 'roster-insite'
  | 'roster-onsite'
  | 'roster-personnel'
  | 'staff';

function isDestinationAllowed(
  destination: AdminDestination,
  role: StaffRole,
): boolean {
  if (destination === 'staff' || destination === 'roster-personnel') {
    return role === 'admin';
  }
  if (
    destination === 'roster-dashboard' ||
    destination === 'roster-insite' ||
    destination === 'roster-onsite'
  ) {
    return role === 'admin' || role === 'operator';
  }
  return true;
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
  const { themeMode } = useAdminTheme();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole>('receptionist');
  const isAdmin = staffRole === 'admin';
  const canAccessRoster = staffRole === 'admin' || staffRole === 'operator';

  useEffect(() => {
    let isMounted = true;

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
        .select('is_active, role')
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

      if (!isDestinationAllowed(initialDestination.current, resolvedRole)) {
        window.location.replace('/?page=admin');
        return;
      }

      if (isMounted) {
        setStaffRole(resolvedRole);
        setIsAuthorized(true);
      }
    };

    void verifyAccess();
    return () => {
      isMounted = false;
      subscription.unsubscribe();
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
    if (isAuthorized && !isDestinationAllowed(destination, staffRole)) {
      window.location.replace('/?page=admin');
      return;
    }

    setVisitedTabs((prev) => {
      if (prev.has(destination)) return prev;
      const next = new Set(prev);
      next.add(destination);
      return next;
    });
  }, [destination, isAuthorized, staffRole]);

  if (!isAuthorized || !isDestinationAllowed(destination, staffRole)) {
    return <AdminLoader />;
  }

  return (
    <Theme theme={dymAdminTheme} mode={themeMode}>
      <div className={destination === 'dashboard' ? 'contents' : 'hidden'}>
        <AdminPage
          authorizedIsAdmin={isAdmin}
          isActiveTab={destination === 'dashboard'}
        />
      </div>

      {activeVisitedTabs.has('registrations') && (
        <div className={destination === 'registrations' ? 'contents' : 'hidden'}>
          <RegistrationsPage
            authorizedIsAdmin={isAdmin}
            isActiveTab={destination === 'registrations'}
          />
        </div>
      )}

      {canAccessRoster &&
        (activeVisitedTabs.has('roster-dashboard') ||
          activeVisitedTabs.has('roster-insite') ||
          activeVisitedTabs.has('roster-onsite') ||
          (isAdmin && activeVisitedTabs.has('roster-personnel'))) && (
          <RosterDataProvider>
            {activeVisitedTabs.has('roster-dashboard') && (
              <div
                className={
                  destination === 'roster-dashboard' ? 'contents' : 'hidden'
                }
              >
                <RosterDashboardPage authorizedIsAdmin={isAdmin} />
              </div>
            )}

            {activeVisitedTabs.has('roster-insite') && (
              <div
                className={destination === 'roster-insite' ? 'contents' : 'hidden'}
              >
                <RosterInsitePage authorizedIsAdmin={isAdmin} />
              </div>
            )}

            {activeVisitedTabs.has('roster-onsite') && (
              <div
                className={destination === 'roster-onsite' ? 'contents' : 'hidden'}
              >
                <RosterOnsitePage authorizedIsAdmin={isAdmin} />
              </div>
            )}

            {isAdmin && activeVisitedTabs.has('roster-personnel') && (
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

      {isAdmin && activeVisitedTabs.has('staff') && (
        <div className={destination === 'staff' ? 'contents' : 'hidden'}>
          <StaffPage isActiveTab={destination === 'staff'} />
        </div>
      )}
    </Theme>
  );
}

export default AdminApplication;
