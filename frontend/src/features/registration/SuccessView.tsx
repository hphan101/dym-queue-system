import React, { useState } from 'react';
import { CheckCircle2, Calendar, User, Phone, CreditCard, Building, Home, Heart, RefreshCw, Eye, FileCheck2 } from 'lucide-react';
import type { TT25RegistrationData } from './types';
import { translations, type SupportedLanguage } from '../../locales';

const TT25PrintModal = React.lazy(() => import('./TT25PrintModal'));
const ConsentPrintModal = React.lazy(() => import('./ConsentPrintModal'));

const REGISTRATION_COOLDOWN_MS = 10 * 60 * 1000;

interface SuccessViewProps {
  queueNumber: string;
  data: TT25RegistrationData | null;
  onReset: () => void;
  lang: SupportedLanguage;
}

export const SuccessView: React.FC<SuccessViewProps> = ({ queueNumber, data, onReset, lang }) => {
  const t = translations[lang];
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);

  const handleClosePrintModal = React.useCallback(() => {
    setIsPrintModalOpen(false);
  }, []);

  const handleCloseConsentModal = React.useCallback(() => {
    setIsConsentModalOpen(false);
  }, []);

  React.useEffect(() => {
    const checkCooldown = () => {
      const lastTime = localStorage.getItem("dym_last_registration_time");
      if (lastTime) {
        const timePassed = Date.now() - parseInt(lastTime, 10);
        if (timePassed < REGISTRATION_COOLDOWN_MS) {
          const remaining = Math.ceil((REGISTRATION_COOLDOWN_MS - timePassed) / 1000);
          setCooldownRemaining((prev) => (prev !== remaining ? remaining : prev));
          return;
        }
      }
      setCooldownRemaining((prev) => (prev !== 0 ? 0 : prev));
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatCooldownTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const fullAddress = data
    ? [data.addressDetail, data.ward, data.province].filter(Boolean).join(', ')
    : '';

  return (
    <div className="text-center space-y-6 animate-fade-in">
      <div className="flex flex-col items-center justify-center space-y-2">
        <div className="w-16 h-16 rounded-full bg-dym-blue-50 flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-dym-blue-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">
          {t.successTitle}
        </h2>
        <p className="text-sm text-slate-500">
          {t.successThanks}
        </p>
      </div>

      <div className="bg-gradient-to-br from-dym-blue-50 to-white border border-dym-blue-100 rounded-2xl p-6 pulse-soft max-w-sm mx-auto">
        <p className="text-xs font-semibold text-dym-blue-700 uppercase tracking-widest mb-1">
          {t.queueLabel}
        </p>
        <div className="text-5xl font-extrabold text-dym-blue-800 tracking-tight my-2">
          {queueNumber}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {t.successNote}
        </p>
      </div>

      {data && <div className="text-left bg-white border border-slate-200 rounded-md p-4 space-y-3 max-w-md mx-auto text-sm shadow-sm">
        <h3 className="font-bold text-slate-700 border-b border-slate-100 pb-2 flex items-center gap-1.5">
          {t.summaryTitle}
        </h3>

        <div className="flex items-start gap-2.5">
          <User className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.fullName}</p>
            <p className="font-semibold text-slate-700">{data.fullName}</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.birthDate}</p>
            <p className="font-medium text-slate-700">
              {new Date(data.birthDate).toLocaleDateString(
                lang === 'vi' ? 'vi-VN' : 'en-US',
              )}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Heart className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.gender}</p>
            <p className="font-medium text-slate-700">
              {data.gender === 'Nam' ? t.genderNam : t.genderNu}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <CreditCard className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.cccd}</p>
            <p className="font-medium text-slate-700">{data.cccd}</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.phoneNumber}</p>
            <p className="font-medium text-slate-700">{data.phoneNumber}</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Home className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.address}</p>
            <p className="font-medium text-slate-700 leading-relaxed">{fullAddress}</p>
          </div>
        </div>

        {data.workplace && (
          <div className="flex items-start gap-2.5">
            <Building className="w-4 h-4 text-slate-400 mt-0.5" />
            <div>
              <p className="text-xs text-slate-400">{t.companyName}</p>
              <p className="font-semibold text-dym-blue-700">{data.workplace}</p>
            </div>
          </div>
        )}
      </div>}

      <div className="pt-2 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3">
        {data && (
          <>
            <button
              type="button"
              onClick={() => setIsConsentModalOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white font-semibold text-xs px-4 py-2.5 rounded shadow-sm transition-all cursor-pointer"
            >
              <FileCheck2 className="w-4 h-4" />
              {lang === 'en' ? 'View Consent Form' : 'Xem Phiếu Đồng Thuận'}
            </button>

            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-dym-blue-500 hover:bg-dym-blue-600 active:scale-95 text-white font-semibold text-xs px-4 py-2.5 rounded shadow-sm transition-all cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              {lang === 'en'
                ? 'View Checkup Form TT25'
                : 'Xem phiếu khám TT25'}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onReset}
          disabled={cooldownRemaining > 0}
          className="inline-flex items-center gap-2 text-dym-blue-600 hover:text-dym-blue-700 font-semibold text-xs py-2 px-3 transition-all focus:outline-none disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${cooldownRemaining > 0 ? '' : 'hover:rotate-180 transition-transform duration-500'}`} />
          {cooldownRemaining > 0 ? `${t.btnNewTurn} (${formatCooldownTime(cooldownRemaining)})` : t.btnNewTurn}
        </button>
      </div>

      {data && (
        <React.Suspense fallback={null}>
          <TT25PrintModal
            isOpen={isPrintModalOpen}
            onClose={handleClosePrintModal}
            data={data}
            allowPrint={false}
          />
          <ConsentPrintModal
            isOpen={isConsentModalOpen}
            onClose={handleCloseConsentModal}
            data={data}
            allowPrint={false}
          />
        </React.Suspense>
      )}
    </div>
  );
};
