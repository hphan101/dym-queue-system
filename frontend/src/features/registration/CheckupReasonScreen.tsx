import React from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import dymLogoDark from '../../assets/dym-logo-dark.png';
import { BRANCH_NAMES } from '../../config/branches';
import type { BranchCode } from '../../types/domain';
import type { SupportedLanguage } from '../../locales';

const PRIMARY_CHECKUP_REASONS = [
  {
    value: 'Khám sức khỏe định kì theo công ty',
    labelVi: 'Khám sức khỏe định kì theo công ty',
    labelEn: 'Corporate periodic health checkup',
  },
  {
    value: 'Khám sức khỏe đi học/đi làm',
    labelVi: 'Khám sức khỏe đi học/đi làm',
    labelEn: 'Health checkup for study / work',
  },
  {
    value: 'Khám sức khỏe cá nhân tự nguyện',
    labelVi: 'Khám sức khỏe cá nhân tự nguyện',
    labelEn: 'Voluntary personal health checkup',
  },
] as const;

interface CheckupReasonScreenProps {
  branch: BranchCode | null;
  lang: SupportedLanguage;
  onSelectReason: (reason: string) => void;
  onBack: () => void;
}

export const CheckupReasonScreen: React.FC<CheckupReasonScreenProps> = ({
  branch,
  lang,
  onSelectReason,
  onBack,
}) => {
  const isEn = lang === 'en';

  return (
    <div className="animate-fade-in py-2 sm:py-4">
      {/* Header */}
      <div className="flex flex-col items-center text-center">
        <img
          src={dymLogoDark}
          alt="DYM Medical Center Vietnam"
          className="h-11 sm:h-12 w-auto object-contain mb-4"
        />

        {branch && (
          <span className="inline-flex items-center rounded bg-dym-blue-50 border border-dym-blue-100 px-3.5 py-1 text-xs font-semibold text-dym-blue-800 mb-5">
            {BRANCH_NAMES[branch]}
          </span>
        )}

        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-dym-blue-800">
          {isEn ? 'Reason for Health Checkup' : 'Lý do khám'}
        </h1>

        <div className="w-10 h-0.5 bg-dym-blue-500/40 my-3.5" />

        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed text-balance">
          {isEn
            ? 'Please select the purpose of your health checkup to continue.'
            : 'Vui lòng chọn mục đích khám\u00A0sức\u00A0khỏe của Quý khách để tiếp tục.'}
        </p>
      </div>

      {/* Reason Options */}
      <div className="mt-6 space-y-3 max-w-md mx-auto">
        {PRIMARY_CHECKUP_REASONS.map((item, idx) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onSelectReason(item.value)}
            className="group w-full flex items-center justify-between gap-4 rounded-md border-2 border-slate-200/90 bg-white px-4 py-3.5 text-left transition-all duration-200 hover:border-dym-blue-500 hover:bg-dym-blue-50/40 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-dym-blue-500/30 cursor-pointer shadow-sm"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-dym-blue-50 border border-dym-blue-100 text-xs font-extrabold text-dym-blue-800 group-hover:bg-dym-blue-500 group-hover:text-white group-hover:border-dym-blue-500 transition-colors">
                {idx + 1}
              </span>
              <span className="text-sm sm:text-base font-bold text-slate-800 group-hover:text-dym-blue-800 transition-colors leading-snug">
                {isEn ? item.labelEn : item.labelVi}
              </span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0 group-hover:text-dym-blue-600 group-hover:translate-x-0.5 transition-all" />
          </button>
        ))}
      </div>

      {/* Back to Language Selection */}
      <div className="mt-5 flex justify-center">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-slate-500 hover:text-dym-blue-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{isEn ? 'Back to language selection' : 'Quay lại chọn ngôn ngữ'}</span>
        </button>
      </div>
    </div>
  );
};
