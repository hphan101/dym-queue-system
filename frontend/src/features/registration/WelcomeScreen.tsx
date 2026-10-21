import React from 'react';
import { ChevronRight } from 'lucide-react';
import dymLogoDark from '../../assets/dym-logo-dark.png';
import { BRANCH_NAMES } from '../../config/branches';
import type { BranchCode } from '../../types/domain';
import type { SupportedLanguage } from '../../locales';

interface WelcomeScreenProps {
  branch: BranchCode | null;
  onSelectLanguage: (lang: SupportedLanguage) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  branch,
  onSelectLanguage,
}) => {
  return (
    <div className="animate-fade-in py-2 sm:py-4">
      {/* Brand Identity & Branch Signpost */}
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
          Kính chào Quý khách
        </h1>
        <p className="text-sm font-medium text-dym-blue-700 mt-0.5">
          Welcome to DYM Medical Center
        </p>

        <div className="w-10 h-0.5 bg-dym-blue-500/40 my-4" />

        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed text-balance">
          Vui lòng chọn ngôn ngữ để bắt đầu khai báo thông tin khám&nbsp;sức&nbsp;khỏe.
          <span className="block text-slate-400 text-xs mt-1">
            Please select your preferred language to begin registration.
          </span>
        </p>
      </div>

      {/* Language Selection Actions */}
      <div className="mt-7 space-y-3 max-w-sm mx-auto">
        <button
          type="button"
          onClick={() => onSelectLanguage('vi')}
          className="group w-full flex items-center justify-between gap-4 rounded-md border-2 border-slate-200/90 bg-white px-4 py-3.5 text-left transition-all duration-200 hover:border-dym-blue-500 hover:bg-dym-blue-50/40 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-dym-blue-500/30 cursor-pointer shadow-sm"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-dym-blue-50 border border-dym-blue-100 text-xs font-extrabold tracking-wider text-dym-blue-800 group-hover:bg-dym-blue-500 group-hover:text-white group-hover:border-dym-blue-500 transition-colors">
              VN
            </span>
            <span className="text-base font-bold text-slate-800 group-hover:text-dym-blue-800 transition-colors">
              Tiếng Việt
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0 group-hover:text-dym-blue-600 group-hover:translate-x-0.5 transition-all" />
        </button>

        <button
          type="button"
          onClick={() => onSelectLanguage('en')}
          className="group w-full flex items-center justify-between gap-4 rounded-md border-2 border-slate-200/90 bg-white px-4 py-3.5 text-left transition-all duration-200 hover:border-dym-blue-500 hover:bg-dym-blue-50/40 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-dym-blue-500/30 cursor-pointer shadow-sm"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-dym-blue-50 border border-dym-blue-100 text-xs font-extrabold tracking-wider text-dym-blue-800 group-hover:bg-dym-blue-500 group-hover:text-white group-hover:border-dym-blue-500 transition-colors">
              EN
            </span>
            <span className="text-base font-bold text-slate-800 group-hover:text-dym-blue-800 transition-colors">
              English
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0 group-hover:text-dym-blue-600 group-hover:translate-x-0.5 transition-all" />
        </button>
      </div>
    </div>
  );
};
