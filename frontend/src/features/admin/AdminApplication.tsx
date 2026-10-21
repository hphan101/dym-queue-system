import { useEffect, useRef, useState } from 'react';
import dymLogoDark from '../../assets/dym-logo-dark.png';
import { supabase } from '../../lib/supabaseClient';
import AdminPage from './AdminPage';
import RegistrationsPage from './RegistrationsPage';
import StaffPage from './StaffPage';

export type AdminDestination = 'dashboard' | 'registrations' | 'staff';

function AdminLoader() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-[#eff9fd]">
      <img
        src={dymLogoDark}
        alt="Đang xác thực quyền quản trị DYM"
        className="h-auto w-40"
      />
      <div className="page-loader-dots" aria-hidden="true" />
    </div>
  );
}

function AdminApplication({ destination }: { destination: AdminDestination }) {
  const initialDestination = useRef(destination);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

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

      const hasAdminRole = profile.role === 'admin';
      if (initialDestination.current === 'staff' && !hasAdminRole) {
        window.location.replace('/?page=admin');
        return;
      }

      if (isMounted) {
        setIsAdmin(hasAdminRole);
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

  useEffect(() => {
    if (isAuthorized && !isAdmin && destination === 'staff') {
      window.location.replace('/?page=admin');
      return;
    }

    setVisitedTabs((prev) => {
      if (prev.has(destination)) return prev;
      const next = new Set(prev);
      next.add(destination);
      return next;
    });
  }, [destination, isAdmin, isAuthorized]);

  if (!isAuthorized || (!isAdmin && destination === 'staff')) {
    return <AdminLoader />;
  }

  return (
    <>
      <div className={destination === 'dashboard' ? 'contents' : 'hidden'}>
        <AdminPage
          authorizedIsAdmin={isAdmin}
          isActiveTab={destination === 'dashboard'}
        />
      </div>

      {visitedTabs.has('registrations') && (
        <div className={destination === 'registrations' ? 'contents' : 'hidden'}>
          <RegistrationsPage
            authorizedIsAdmin={isAdmin}
            isActiveTab={destination === 'registrations'}
          />
        </div>
      )}

      {isAdmin && visitedTabs.has('staff') && (
        <div className={destination === 'staff' ? 'contents' : 'hidden'}>
          <StaffPage isActiveTab={destination === 'staff'} />
        </div>
      )}
    </>
  );
}

export default AdminApplication;
