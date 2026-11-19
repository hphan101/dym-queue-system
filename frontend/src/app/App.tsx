import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, startTransition, Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TooltipProvider } from '../components/ui/tooltip';
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
  const route = resolveAppRoute(location.pathname, location.search);

  useEffect(() => {
    const syncLocation = () => {
      const nextLocation = {
        pathname: window.location.pathname,
        search: window.location.search,
      };
      if (route.kind === 'admin' && resolveAppRoute(nextLocation.pathname, nextLocation.search).kind === 'admin') {
        setLocation(nextLocation);
      } else {
        startTransition(() => setLocation(nextLocation));
      }
    };

    window.addEventListener('popstate', syncLocation);
    window.addEventListener(APP_NAVIGATION_EVENT, syncLocation);

    return () => {
      window.removeEventListener('popstate', syncLocation);
      window.removeEventListener(APP_NAVIGATION_EVENT, syncLocation);
    };
  }, [route.kind]);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <TooltipProvider delayDuration={120}>
          <Suspense fallback={null}>
            {route.kind === 'display' && <QueueDisplayPage />}
            {route.kind === 'registration-qr' && <RegistrationQrPage />}
            {route.kind === 'login' && <LoginPage />}
            {route.kind === 'admin' && (
              <AdminApplication destination={route.destination} />
            )}
            {route.kind === 'registration' && <RegistrationFlowPage />}
          </Suspense>
        </TooltipProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;
