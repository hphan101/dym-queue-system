import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, startTransition, Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import LoginPage from '../features/auth/LoginPage';
import { APP_NAVIGATION_EVENT } from '../lib/navigation';
import { queryClient } from '../lib/queryClient';
import { resolveAppRoute } from './routes';

const AdminApplication = lazy(() => import('../features/admin/AdminApplication'));
const QueueDisplayPage = lazy(() => import('../features/display/QueueDisplayPage'));
const RegistrationQrPage = lazy(() => import('../features/registration/access/RegistrationQrPage'));
const RegistrationFlowPage = lazy(() =>
  import('../features/registration/flow/RegistrationFlowPage').then((m) => ({
    default: m.RegistrationFlowPage,
  }))
);





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
