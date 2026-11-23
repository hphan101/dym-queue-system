import React from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import dymLogoDark from '../../../assets/dym-logo-dark.png';
import { BRANCH_NAMES } from '../../../config/branches';
import type { BranchCode } from '../../../types/domain';
import type { SupportedLanguage } from '../../../locales/index';
import { CHECKUP_REASON_OPTIONS } from '../tt25Constants';

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
          {lang === 'ja' ? '健康診断の目的' : isEn ? 'Reason for Health Checkup' : 'Lý do khám'}
        </h1>

        <div className="w-10 h-0.5 bg-dym-blue-500/40 my-3.5" />

        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed text-balance">
          {lang === 'ja' ? '受診の目的を選択してください。' : isEn
            ? 'Please select the purpose of your health checkup to continue.'
            : 'Vui lòng chọn mục đích khám\u00A0sức\u00A0khỏe của Quý khách để tiếp tục.'}
        </p>
      </div>

      {/* Reason Options */}
      <div className="mt-6 space-y-3 max-w-md mx-auto">
        {CHECKUP_REASON_OPTIONS.map((item, idx) => (
          <Button
            key={item.value}
            type="button"
            variant="outline"
            onClick={() => onSelectReason(item.value)}
            className="group h-auto w-full justify-between gap-4 whitespace-normal px-4 py-3.5 text-left hover:border-primary hover:bg-accent/50 hover:text-foreground focus-visible:ring-ring"
          >
            <span className="flex min-w-0 items-center gap-3.5">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded bg-primary text-xs font-semibold text-primary-foreground">
                {idx + 1}
              </span>
              <span className="text-sm font-semibold leading-snug sm:text-base">
                {lang === 'ja' ? item.labelJa : isEn ? item.labelEn : item.value}
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="text-muted-foreground group-hover:text-primary group-focus-visible:text-primary" />
          </Button>
        ))}
      </div>

      {/* Back to Language Selection */}
      <div className="mt-5 flex">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ChevronLeft aria-hidden="true" />
          {lang === 'ja' ? '戻る' : isEn ? 'Back' : 'Quay lại'}
        </Button>
      </div>
    </div>
  );
};
