import { lazy, Suspense, startTransition, useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { AdminDestination } from './features/admin/AdminApplication';
import LoginPage from './features/auth/LoginPage';
import { APP_NAVIGATION_EVENT } from './lib/navigation';
import { queryClient } from './lib/queryClient';

const AdminApplication = lazy(() => import('./features/admin/AdminApplication'));
const QueueDisplayPage = lazy(() => import('./features/display/QueueDisplayPage'));
const RegistrationQrPage = lazy(() => import('./features/registration/RegistrationQrPage'));
const RegistrationFlowPage = lazy(() =>
  import('./features/registration/RegistrationFlowPage').then((m) => ({
    default: m.RegistrationFlowPage,
  }))
);

type AppRoute =
  | { kind: 'registration-qr' }
  | { kind: 'display' }
  | { kind: 'login' }
  | { kind: 'admin'; destination: AdminDestination }
  | { kind: 'registration' };

function resolveAppRoute(rawPathname: string, search: string): AppRoute {
  const pathname = rawPathname.replace(/\/+$/, '') || '/';
  const requestedPage = new URLSearchParams(search).get('page');

  if (pathname === '/registration-qr' || requestedPage === 'registration-qr') {
    return { kind: 'registration-qr' };
  }

  if (pathname === '/display' || requestedPage === 'display') {
    return { kind: 'display' };
  }
  if (pathname === '/login' || requestedPage === 'login') {
    return { kind: 'login' };
  }
  if (
    pathname === '/staff' ||
    pathname.startsWith('/admin/staff') ||
    requestedPage === 'staff'
  ) {
    return { kind: 'admin', destination: 'staff' };
  }
  if (
    pathname === '/roster-personnel' ||
    pathname.startsWith('/admin/roster-personnel') ||
    requestedPage === 'roster-personnel'
  ) {
    return { kind: 'admin', destination: 'roster-personnel' };
  }
  if (
    pathname === '/roster-onsite' ||
    pathname.startsWith('/admin/roster-onsite') ||
    requestedPage === 'roster-onsite'
  ) {
    return { kind: 'admin', destination: 'roster-onsite' };
  }
  if (
    pathname === '/roster-insite' ||
    pathname.startsWith('/admin/roster-insite') ||
    requestedPage === 'roster-insite'
  ) {
    return { kind: 'admin', destination: 'roster-insite' };
  }
  if (
    pathname === '/roster-settlement' ||
    pathname.startsWith('/admin/roster-settlement') ||
    requestedPage === 'roster-settlement'
  ) {
    return { kind: 'admin', destination: 'roster-settlement' };
  }
  if (
    pathname === '/roster' ||
    pathname === '/roster-dashboard' ||
    pathname.startsWith('/admin/roster') ||
    requestedPage === 'roster' ||
    requestedPage === 'roster-dashboard'
  ) {
    return { kind: 'admin', destination: 'roster-dashboard' };
  }
  if (
    pathname === '/registrations' ||
    pathname.startsWith('/admin/registrations') ||
    requestedPage === 'registrations'
  ) {
    return { kind: 'admin', destination: 'registrations' };
  }
  if (
    pathname === '/admin' ||
    pathname.startsWith('/admin') ||
    requestedPage === 'admin'
  ) {
    return { kind: 'admin', destination: 'dashboard' };
  }

  return { kind: 'registration' };
}

function App() {
  const [location, setLocation] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));

  useEffect(() => {
    const syncLocation = () => {
      startTransition(() => {
        setLocation({
          pathname: window.location.pathname,
          search: window.location.search,
        });
      });
    };

    window.addEventListener('popstate', syncLocation);
    window.addEventListener(APP_NAVIGATION_EVENT, syncLocation);

    return () => {
      window.removeEventListener('popstate', syncLocation);
      window.removeEventListener(APP_NAVIGATION_EVENT, syncLocation);
    };
  }, []);

  const route = resolveAppRoute(location.pathname, location.search);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <Suspense fallback={null}>
          {route.kind === 'display' && <QueueDisplayPage />}
          {route.kind === 'registration-qr' && <RegistrationQrPage />}
          {route.kind === 'login' && <LoginPage />}
          {route.kind === 'admin' && (
            <AdminApplication destination={route.destination} />
          )}
          {route.kind === 'registration' && <RegistrationFlowPage />}
        </Suspense>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;
