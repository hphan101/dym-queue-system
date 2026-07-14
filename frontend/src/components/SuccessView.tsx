import React from 'react';
import { CheckCircle2, Calendar, MapPin, Award, User, RefreshCw } from 'lucide-react';
import type { RegistrationData } from '../types';
import { translations } from '../translations';
import { BRANCH_TRANSLATIONS, SERVICE_TRANSLATIONS } from './RegistrationForm';

interface SuccessViewProps {
  queueNumber: string;
  data: RegistrationData;
  onReset: () => void;
  lang: 'vi' | 'en';
}

// Component hiển thị thông tin khi khách hàng đăng ký thành công
export const SuccessView: React.FC<SuccessViewProps> = ({ queueNumber, data, onReset, lang }) => {
  const t = translations[lang];

  return (
    <div className="text-center space-y-6 animate-fade-in">
      {/* Icon Đăng ký thành công */}
      <div className="flex flex-col items-center justify-center space-y-2">
        <div className="w-16 h-16 rounded-full bg-dym-blue-50 flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-dym-blue-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">{t.successTitle}</h2>
        <p className="text-sm text-slate-500">
          {t.successThanks}
        </p>
      </div>

      {/* Số thứ tự nổi bật */}
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

      {/* Tóm tắt thông tin đăng ký */}
      <div className="text-left bg-white border border-slate-100 rounded-xl p-4 space-y-3 max-w-md mx-auto text-sm shadow-sm">
        <h3 className="font-bold text-slate-700 border-b border-slate-100 pb-2 flex items-center gap-1.5">
          {t.summaryTitle}
        </h3>

        {/* Khách hàng */}
        <div className="flex items-start gap-2.5">
          <User className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.fullName}</p>
            <p className="font-semibold text-slate-700">{data.fullName}</p>
          </div>
        </div>

        {/* Chi nhánh */}
        <div className="flex items-start gap-2.5">
          <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.branchLabel}</p>
            <p className="font-medium text-slate-700">
              {BRANCH_TRANSLATIONS[data.branch] ? BRANCH_TRANSLATIONS[data.branch][lang] : data.branch}
            </p>
          </div>
        </div>

        {/* Dịch vụ */}
        <div className="flex items-start gap-2.5">
          <Award className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.serviceLabel}</p>
            <p className="font-medium text-slate-700">
              {SERVICE_TRANSLATIONS[data.service] ? SERVICE_TRANSLATIONS[data.service][lang] : data.service}
            </p>
          </div>
        </div>

        {/* Ngày sinh */}
        <div className="flex items-start gap-2.5">
          <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.birthDate}</p>
            <p className="font-medium text-slate-700">
              {new Date(data.birthDate).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')}
            </p>
          </div>
        </div>
      </div>

      {/* Hành động tiếp theo */}
      <div className="pt-2">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 text-dym-blue-600 hover:text-dym-blue-700 font-semibold text-sm transition-all focus:outline-none"
        >
          <RefreshCw className="w-4 h-4" />
          {t.btnNewTurn}
        </button>
      </div>
    </div>
  );
};
