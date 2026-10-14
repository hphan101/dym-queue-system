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

  if (!isAuthorized) return <AdminLoader />;
  if (destination === 'registrations') {
    return <RegistrationsPage authorizedIsAdmin={isAdmin} />;
  }
  if (destination === 'staff' && isAdmin) return <StaffPage />;
  return <AdminPage authorizedIsAdmin={isAdmin} />;
}

export default AdminApplication;
