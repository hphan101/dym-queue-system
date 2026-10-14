import {
  lazy,
  startTransition,
  Suspense,
  useEffect,
  useState,
} from 'react';
import { RegistrationForm } from './features/registration/RegistrationForm';
import { SuccessView } from './features/registration/SuccessView';
import type {
  RegistrationData,
  RegistrationResponse,
} from './features/registration/types';
import { BRANCH_NAMES, isBranchCode } from './config/branches';
import type { BranchCode } from './types/domain';
import { AlertCircle, Phone, Mail, MapPin, Clock } from 'lucide-react';
import dymLogo from './assets/dym-logo.png';
import dymLogoDark from './assets/dym-logo-dark.png';
import { translations } from './features/registration/translations';
import { APP_NAVIGATION_EVENT } from './lib/navigation';
import { formatQueueNumber } from './lib/queueNumber';

import { ErrorBoundary } from './components/ErrorBoundary';

const LoginPage = lazy(() => import('./features/auth/LoginPage'));
const AdminApplication = lazy(
  () => import('./features/admin/AdminApplication'),
);
const QueueDisplayPage = lazy(
  () => import('./features/display/QueueDisplayPage'),
);

function RouteLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-[#eff9fd]">
      <img src={dymLogoDark} alt={label} className="h-auto w-40" />
      <div className="page-loader-dots" aria-hidden="true" />
    </div>
  );
}

function getBranchFromUrl(): BranchCode | null {
  const branch = new URLSearchParams(window.location.search).get('branch')?.toLowerCase();
  return isBranchCode(branch) ? branch : null;
}

function RegistrationApp() {
  const branch = getBranchFromUrl();
  const [lang, setLang] = useState<'vi' | 'en'>(() => {
    return (localStorage.getItem('dym_registration_lang') as 'vi' | 'en') || 'vi';
  });

  const [step, setStep] = useState<'form' | 'success'>(() => {
    const savedStep = localStorage.getItem('dym_registration_step');
    const savedQueue = localStorage.getItem('dym_registration_queue');
    return savedStep === 'success' && savedQueue ? 'success' : 'form';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPageLoader, setShowPageLoader] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredData, setRegisteredData] = useState<RegistrationData | null>(null);
  const [queueNumber, setQueueNumber] = useState<string>(() => {
    const storedQueueNumber = localStorage.getItem('dym_registration_queue');
    return storedQueueNumber ? formatQueueNumber(storedQueueNumber) : '';
  });

  const registrationApiUrl = import.meta.env.VITE_REGISTRATION_API_URL;

  // Remove PII saved by versions released before the Supabase migration.
  useEffect(() => {
    localStorage.removeItem('dym_registration_data');
  }, []);

  const handleLangChange = (newLang: 'vi' | 'en') => {
    setLang(newLang);
    localStorage.setItem('dym_registration_lang', newLang);
  };

  const handleFormSubmit = async (formData: RegistrationData) => {
    setIsLoading(true);
    setShowPageLoader(false);
    setError(null);
    const loaderTimer = window.setTimeout(() => setShowPageLoader(true), 500);
    const finishLoading = () => {
      window.clearTimeout(loaderTimer);
      setShowPageLoader(false);
      setIsLoading(false);
    };

    if (!registrationApiUrl) {
      setError(translations[lang].errorUrl);
      finishLoading();
      return;
    }

    const requestController = new AbortController();
    const requestTimeout = window.setTimeout(
      () => requestController.abort(),
      15_000,
    );

    try {
      const response = await fetch(registrationApiUrl, {
        method: 'POST',
        mode: 'cors',
        signal: requestController.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json() as RegistrationResponse;

      if (response.ok && result.success && result.queueNumber) {
        const formattedQueueNumber = formatQueueNumber(result.queueNumber);
        setQueueNumber(formattedQueueNumber);
        setRegisteredData(formData);
        setStep('success');
        
        // Patient details remain in memory; only the queue receipt persists.
        localStorage.setItem('dym_registration_step', 'success');
        localStorage.setItem('dym_registration_queue', formattedQueueNumber);
        localStorage.setItem('dym_last_registration_time', Date.now().toString());
      } else {
        throw new Error(
          result.error ||
          (lang === 'vi'
            ? 'Có lỗi xảy ra khi lưu thông tin.'
            : 'An error occurred while saving information.'),
        );
      }
    } catch (err: unknown) {
      console.error('Lỗi khi gửi đăng ký:', err);
      setError(
        err instanceof DOMException && err.name === 'AbortError'
          ? lang === 'vi'
            ? 'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.'
            : 'The request took too long. Please try again.'
          : err instanceof Error
            ? err.message
            : lang === 'vi'
              ? 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng.'
              : 'Unable to connect to the server. Please check your network connection.',
      );
    } finally {
      window.clearTimeout(requestTimeout);
      finishLoading();
    }
  };

  const handleReset = () => {
    setStep('form');
    setRegisteredData(null);
    setQueueNumber('');
    setError(null);
    
    localStorage.removeItem('dym_registration_step');
    localStorage.removeItem('dym_registration_data');
    localStorage.removeItem('dym_registration_queue');
  };

  return (
    <div className="min-h-screen bg-[#f4f9fc] flex flex-col justify-between pt-6">
      {showPageLoader && (
        <div className="page-loader animate-fade-in">
          <img
            src={dymLogoDark}
            alt="DYM Medical Center"
            className="page-loader-logo object-contain"
          />
          <div className="page-loader-dots"></div>
        </div>
      )}

      <main className="flex-grow max-w-md md:max-w-lg w-full mx-auto px-4 py-6 flex flex-col justify-center">
        <div className="flex justify-end mb-3">
          <div className="inline-flex rounded-lg border border-slate-200/60 bg-white/90 p-0.5 shadow-sm text-[11px] backdrop-blur-sm">
            <button
              onClick={() => handleLangChange('vi')}
              className={`px-3 py-1 rounded-md font-semibold transition-all ${
                lang === 'vi'
                  ? 'bg-dym-blue-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tiếng Việt
            </button>
            <button
              onClick={() => handleLangChange('en')}
              className={`px-3 py-1 rounded-md font-semibold transition-all ${
                lang === 'en'
                  ? 'bg-dym-blue-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              English
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-8 medical-card">
          {step === 'form' && (
            <div className="mb-6 text-center">
              <h2 className="text-xl font-extrabold text-slate-800">
                {translations[lang].title}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {translations[lang].subtitle}
              </p>
              {branch && (
                <p className="mt-2 inline-flex rounded-full bg-dym-blue-50 px-3 py-1 text-xs font-semibold text-dym-blue-700">
                  {BRANCH_NAMES[branch]}
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2.5 text-xs text-red-700 animate-shake">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{translations[lang].failedTitle}</p>
                <p className="mt-0.5 leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {step === 'form' ? (
            branch ? (
              <RegistrationForm
                onSubmit={handleFormSubmit}
                isLoading={isLoading}
                lang={lang}
                branch={branch}
              />
            ) : (
              <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-center text-sm text-red-700">
                {lang === 'vi'
                  ? 'Liên kết đăng ký không xác định chi nhánh. Vui lòng quét lại mã QR tại cơ sở DYM.'
                  : 'This registration link does not identify a branch. Please scan the QR code at the DYM location.'}
              </div>
            )
          ) : (
            <SuccessView
              queueNumber={queueNumber}
              data={registeredData}
              onReset={handleReset}
              lang={lang}
            />
          )}
        </div>
      </main>

      <footer className="bg-[#111833] text-slate-300 py-10 text-xs border-t border-slate-800/80">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            <div className="space-y-4">
              <div>
                <img src={dymLogo} alt="DYM Medical Center Vietnam" className="h-10 w-auto object-contain" />
              </div>
              <div className="space-y-2.5 text-slate-300">
                <div className="flex items-start gap-2.5">
                  <Phone className="w-4 h-4 text-[#63c4e8] shrink-0 mt-0.5" />
                  <p>
                    <span className="font-semibold text-white">Hotline:</span>{' '}
                    <a href="tel:1900292937" className="hover:text-white transition-colors">1900 29 29 37</a>
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <Mail className="w-4 h-4 text-[#63c4e8] shrink-0 mt-0.5" />
                  <p>
                    <span className="font-semibold text-white">Email:</span>{' '}
                    <a href="mailto:info@dymmedicalcenter.com.vn" className="hover:text-[#63c4e8] transition-colors">info@dymmedicalcenter.com.vn</a>
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-[#63c4e8] shrink-0 mt-0.5" />
                  <p>
                    <span className="font-semibold text-white">Thời gian hoạt động:</span> 8:00 - 18:00
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold text-white text-[13px] uppercase tracking-wider border-b border-slate-800 pb-1.5">
                Cơ sở TP. Hồ Chí Minh
              </h4>
              <div className="space-y-3">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-[#63c4e8] shrink-0 mt-0.5" />
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=DYM+Medical+Center+Sài+Gòn+mPlaza+Saigon"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white hover:underline transition-all leading-relaxed"
                  >
                    <span className="font-semibold text-white">DYM mPlaza Quận 1:</span> Phòng B101–B103, Tầng hầm 1, tòa nhà mPlaza Saigon, số 39 Lê Duẩn, Phường Bến Nghé, Quận 1, TP Hồ Chí Minh.
                  </a>
                </div>
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-[#63c4e8] shrink-0 mt-0.5" />
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=DYM+Medical+Center+Phú+Mỹ+Hưng+The+Grace"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white hover:underline transition-all leading-relaxed"
                  >
                    <span className="font-semibold text-white">DYM The Grace Quận 7:</span> Phòng 3A01, Tầng 3A, Tòa nhà The Grace, 71 Hoàng Văn Thái, Phường Tân Phú, Quận 7, TP Hồ Chí Minh.
                  </a>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold text-white text-[13px] uppercase tracking-wider border-b border-slate-800 pb-1.5">
                Cơ sở Hà Nội
              </h4>
              <div className="space-y-3">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-[#63c4e8] shrink-0 mt-0.5" />
                  <a
                    href="https://maps.app.goo.gl/hrh2TypSzWQJGnyq9"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white hover:underline transition-all leading-relaxed"
                  >
                    <span className="font-semibold text-white">DYM Epic Tower Cầu Giấy:</span> Tầng Hầm B1, Toà Epic Tower, Ngõ 19 Duy Tân, Phường Cầu Giấy, TP Hà Nội.
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800/60 mt-8 pt-4 text-center text-[10px] text-slate-500">
            <p>&copy; 2026 DYM Medical Center. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
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

  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const requestedPage = new URLSearchParams(location.search).get('page');
  const isLoginPage = pathname === '/login' || requestedPage === 'login';
  const isAdminPage = pathname === '/admin' || requestedPage === 'admin';
  const isRegistrationsPage =
    pathname === '/registrations' || requestedPage === 'registrations';
  const isStaffPage = pathname === '/staff' || requestedPage === 'staff';
  const isQueueDisplayPage =
    pathname === '/display' || requestedPage === 'display';

  return (
    <ErrorBoundary>
      {isQueueDisplayPage ? (
        <Suspense fallback={<RouteLoader label="Đang tải màn hình chờ DYM" />}>
          <QueueDisplayPage />
        </Suspense>
      ) : isAdminPage || isRegistrationsPage || isStaffPage ? (
        <Suspense fallback={<RouteLoader label="Đang tải trang quản trị DYM" />}>
          <AdminApplication
            destination={
              isStaffPage
                ? 'staff'
                : isRegistrationsPage
                  ? 'registrations'
                  : 'dashboard'
            }
          />
        </Suspense>
      ) : isLoginPage ? (
        <Suspense fallback={<RouteLoader label="Đang tải cổng nhân viên DYM" />}>
          <LoginPage />
        </Suspense>
      ) : (
        <RegistrationApp />
      )}
    </ErrorBoundary>
  );
}

export default App;
