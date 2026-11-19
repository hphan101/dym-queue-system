import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import dymLogoDark from '../../../assets/dym-logo-dark.png';
import { BRANCH_NAMES } from '../../../config/branches';
import type { SupportedLanguage } from '../../../locales/index';
import type { BranchCode } from '../../../types/domain';

interface WelcomeScreenProps {
  branch: BranchCode | null;
  onSelectLanguage: (lang: SupportedLanguage) => void;
}

const languages = [
  { code: 'vi', badge: 'VN', label: 'Tiếng Việt' },
  { code: 'en', badge: 'EN', label: 'English' },
] as const;

export function WelcomeScreen({ branch, onSelectLanguage }: WelcomeScreenProps) {
  return (
    <section aria-labelledby="registration-language-title" className="mx-auto flex w-full max-w-sm flex-col gap-6 py-4 sm:py-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <img src={dymLogoDark} alt="DYM Medical Center Vietnam" className="h-12 w-auto object-contain" />
        {branch && (
          <span className="inline-flex items-center rounded border border-dym-blue-100 bg-dym-blue-50 px-3.5 py-1 text-xs font-semibold text-dym-blue-800">
            {BRANCH_NAMES[branch]}
          </span>
        )}
        <p className="mt-2 flex flex-col gap-1" lang="vi">
          <span className="text-xl font-semibold text-foreground sm:text-2xl">Kính chào Quý khách</span>
          <span lang="en" className="text-base text-muted-foreground">Welcome to DYM Medical Center</span>
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h1 id="registration-language-title" className="flex flex-col gap-1 text-center text-2xl font-semibold leading-8 text-foreground" lang="vi">
          Chọn ngôn ngữ
          <span lang="en" className="text-sm font-normal leading-5 text-muted-foreground">Choose your language</span>
        </h1>
        <div className="grid gap-3">
          {languages.map(({ code, badge, label }) => (
            <Button key={code} type="button" variant="outline" lang={code} onClick={() => onSelectLanguage(code)}
              className="group h-auto min-h-14 w-full justify-start gap-3 px-4 py-2 text-left text-base font-semibold shadow-none hover:border-primary hover:bg-accent/50 hover:text-foreground focus-visible:ring-ring motion-reduce:transition-none motion-reduce:active:transform-none">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded bg-primary text-xs font-semibold text-primary-foreground">{badge}</span>
              <span className="flex-1">{label}</span>
              <ChevronRight aria-hidden="true" className="text-muted-foreground transition-colors group-hover:text-primary group-focus-visible:text-primary motion-reduce:transition-none" />
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
