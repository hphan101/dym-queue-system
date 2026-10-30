import { useEffect, useState } from 'react';
import { AlertCircle, Clock, Mail, MapPin, Phone } from 'lucide-react';
import dymLogo from '../../assets/dym-logo.png';
import dymLogoDark from '../../assets/dym-logo-dark.png';
import { BRANCH_NAMES, isBranchCode } from '../../config/branches';
import { formatQueueNumber } from '../../lib/queueNumber';
import { translations, type SupportedLanguage } from '../../locales';
import type { BranchCode } from '../../types/domain';
import { CheckupReasonScreen } from './CheckupReasonScreen';
import { ConsentScreen } from './ConsentScreen';
import { SuccessView } from './SuccessView';
import { TT25RegistrationForm } from './TT25RegistrationForm';
import type { RegistrationResponse, TT25RegistrationData } from './types';
import { WelcomeScreen } from './WelcomeScreen';

function getBranchFromUrl(): BranchCode | null {
  const branch = new URLSearchParams(window.location.search)
    .get('branch')
    ?.toLowerCase();
  return isBranchCode(branch) ? branch : null;
}

export function RegistrationFlowPage() {
  const branch = getBranchFromUrl();
  const [lang, setLang] = useState<SupportedLanguage>(() => {
    const saved = localStorage.getItem('dym_registration_lang');
    return saved === 'en' ? saved : 'vi';
  });

  const [step, setStep] = useState<
    'welcome' | 'reason' | 'consent' | 'form' | 'success'
  >(() => {
    const savedStep = localStorage.getItem('dym_registration_step');
    const savedQueue = localStorage.getItem('dym_registration_queue');
    return savedStep === 'success' && savedQueue ? 'success' : 'welcome';
  });
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [consentAgreed, setConsentAgreed] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPageLoader, setShowPageLoader] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredData, setRegisteredData] =
    useState<TT25RegistrationData | null>(null);
  const [queueNumber, setQueueNumber] = useState<string>(() => {
    const storedQueueNumber = localStorage.getItem('dym_registration_queue');
    return storedQueueNumber ? formatQueueNumber(storedQueueNumber) : '';
  });

  const registrationApiUrl = import.meta.env.VITE_REGISTRATION_API_URL;

  // Remove PII saved by versions released before the Supabase migration.
  useEffect(() => {
    localStorage.removeItem('dym_registration_data');
    localStorage.removeItem('dym_tt25_customer_extras_v1');
  }, []);

  const handleSelectLanguage = (newLang: SupportedLanguage) => {
    setLang(newLang);
    localStorage.setItem('dym_registration_lang', newLang);
    setError(null);
    setStep('reason');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectReason = (reason: string) => {
    setSelectedReason(reason);
    setError(null);
    setStep('consent');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectConsent = (agreed: boolean) => {
    setConsentAgreed(agreed);
    setError(null);
    setStep('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFormSubmit = async (formData: TT25RegistrationData) => {
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

    const payload = {
      ...formData,
      companyName: formData.workplace || '',
      consentAgreed,
    };

    try {
      const response = await fetch(registrationApiUrl, {
        method: 'POST',
        mode: 'cors',
        signal: requestController.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = (await response
        .json()
        .catch(() => null)) as RegistrationResponse | null;

      if (response.ok && result?.success && result.queueNumber) {
        const formattedQueueNumber = formatQueueNumber(result.queueNumber);
        setQueueNumber(formattedQueueNumber);
        setRegisteredData({
          ...formData,
          consentAgreed,
          queueNumber: formattedQueueNumber,
        });
        setStep('success');

        // Patient details remain in memory; only the queue receipt persists.
        localStorage.setItem('dym_registration_step', 'success');
        localStorage.setItem('dym_registration_queue', formattedQueueNumber);
        localStorage.setItem(
          'dym_last_registration_time',
          Date.now().toString(),
        );
      } else {
        throw new Error(result?.error || translations[lang].saveError);
      }
    } catch (err: unknown) {
      console.error('Lỗi khi gửi đăng ký:', err);
      setError(
        err instanceof DOMException && err.name === 'AbortError'
          ? translations[lang].requestTimeout
          : err instanceof Error
            ? err.message
            : translations[lang].networkError,
      );
    } finally {
      window.clearTimeout(requestTimeout);
      finishLoading();
    }
  };

  const handleReset = () => {
    setStep('welcome');
    setSelectedReason('');
    setConsentAgreed(true);
    setRegisteredData(null);
    setQueueNumber('');
    setError(null);

    localStorage.removeItem('dym_registration_step');
    localStorage.removeItem('dym_registration_data');
    localStorage.removeItem('dym_registration_queue');
    localStorage.removeItem('dym_tt25_customer_extras_v1');
  };

  return (
    <div className="min-h-[100dvh] bg-[#f4f9fc] flex flex-col justify-between pt-6">
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

      <main className="flex-grow max-w-md md:max-w-xl lg:max-w-2xl w-full mx-auto px-4 py-6 flex flex-col justify-center">
        <div className="bg-white rounded-lg border border-slate-200/80 p-5 sm:p-8 shadow-sm">
          {branch && step === 'form' && (
            <div className="mb-6 text-center">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-dym-blue-50 text-dym-blue-700 text-xs font-semibold mb-1.5">
                {lang === 'vi'
                  ? 'Thông tư 25/2026/TT-BYT (Mẫu 03)'
                  : 'Circular 25/2026/TT-BYT (Form 03)'}
              </span>
              <h1 className="text-xl font-extrabold text-slate-800">
                {lang === 'vi'
                  ? 'Hồ Sơ Khám Sức Khỏe'
                  : translations[lang].title}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                {lang === 'vi'
                  ? 'Vui lòng hoàn tất 12 mục hành chính và tiền sử y tế để in phiếu khám'
                  : 'Please complete the 12 administrative items and medical history to print your checkup form'}
              </p>
              <p className="mt-2 inline-flex rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {BRANCH_NAMES[branch]}
              </p>
            </div>
          )}

          {error && (
            <div className="mb-5 p-3.5 rounded-md bg-red-50 flex items-start gap-2.5 text-xs font-medium text-red-900 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <div>
                <p className="font-semibold text-red-950">
                  {translations[lang].failedTitle}
                </p>
                <p className="mt-0.5 leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {!branch && step !== 'success' ? (
            <div className="py-4 text-center space-y-5">
              <img
                src={dymLogoDark}
                alt="DYM Medical Center Vietnam"
                className="h-12 sm:h-14 w-auto object-contain mx-auto"
              />
              <div className="rounded-md bg-red-50 p-4 text-center text-sm font-medium text-red-900">
                {translations[lang].noBranchError}
              </div>
            </div>
          ) : step === 'welcome' ? (
            <WelcomeScreen
              branch={branch}
              onSelectLanguage={handleSelectLanguage}
            />
          ) : step === 'reason' ? (
            <CheckupReasonScreen
              branch={branch}
              lang={lang}
              onSelectReason={handleSelectReason}
              onBack={() => setStep('welcome')}
            />
          ) : step === 'consent' ? (
            <ConsentScreen
              branch={branch}
              lang={lang}
              onSelectConsent={handleSelectConsent}
              onBack={() => setStep('reason')}
            />
          ) : step === 'form' ? (
            <TT25RegistrationForm
              onSubmit={handleFormSubmit}
              isLoading={isLoading}
              branch={branch!}
              lang={lang}
              initialCheckupReason={selectedReason}
            />
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

      <footer className="mt-auto border-t border-slate-800/80 bg-[#111833] pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-10 text-xs text-slate-300">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="sr-only">
            {lang === 'vi'
              ? 'Hệ thống cơ sở phòng khám và thông tin liên hệ'
              : 'Clinic branch locations and contact information'}
          </h2>
          <div className="grid grid-cols-1 gap-8 text-left md:grid-cols-3">
            <div className="flex flex-col gap-4">
              <img
                src={dymLogo}
                alt="DYM Medical Center Vietnam"
                className="h-9 w-auto self-start object-contain"
              />
              <div className="flex flex-col gap-2.5 text-slate-300">
                <div className="flex items-start gap-2.5">
                  <Phone className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <p>
                    <span className="font-semibold text-white">Hotline:</span>{' '}
                    <a
                      href="tel:1900292937"
                      className="transition-colors hover:text-white"
                    >
                      1900 29 29 37
                    </a>
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <Mail className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <p>
                    <span className="font-semibold text-white">Email:</span>{' '}
                    <a
                      href="mailto:info@dymmedicalcenter.com.vn"
                      className="transition-colors hover:text-white"
                    >
                      info@dymmedicalcenter.com.vn
                    </a>
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <p>
                    <span className="font-semibold text-white">
                      Thời gian hoạt động:
                    </span>{' '}
                    8:00 - 18:00
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="border-b border-slate-800/80 pb-1.5 text-sm font-semibold uppercase tracking-wider text-white">
                Cơ sở TP. Hồ Chí Minh
              </h3>
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=DYM+Medical+Center+Sài+Gòn+mPlaza+Saigon"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="leading-relaxed transition-colors hover:text-white hover:underline"
                  >
                    <span className="font-semibold text-white">
                      DYM mPlaza Quận 1:
                    </span>{' '}
                    Phòng B101–B103, Tầng hầm 1, tòa nhà mPlaza Saigon, số 39 Lê
                    Duẩn, Phường Bến Nghé, Quận 1, TP Hồ Chí Minh.
                  </a>
                </div>
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=DYM+Medical+Center+Phú+Mỹ+Hưng+The+Grace"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="leading-relaxed transition-colors hover:text-white hover:underline"
                  >
                    <span className="font-semibold text-white">
                      DYM The Grace Quận 7:
                    </span>{' '}
                    Phòng 3A01, Tầng 3A, Tòa nhà The Grace, 71 Hoàng Văn Thái,
                    Phường Tân Phú, Quận 7, TP Hồ Chí Minh.
                  </a>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="border-b border-slate-800/80 pb-1.5 text-sm font-semibold uppercase tracking-wider text-white">
                Cơ sở Hà Nội
              </h3>
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <a
                    href="https://maps.app.goo.gl/hrh2TypSzWQJGnyq9"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="leading-relaxed transition-colors hover:text-white hover:underline"
                  >
                    <span className="font-semibold text-white">
                      DYM Epic Tower Cầu Giấy:
                    </span>{' '}
                    Tầng Hầm B1, Toà Epic Tower, Ngõ 19 Duy Tân, Phường Cầu
                    Giấy, TP Hà Nội.
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-800/80 pt-4 text-center text-xs text-slate-300">
            <p>&copy; 2026 DYM Medical Center. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default RegistrationFlowPage;
