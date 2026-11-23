import { Fragment, useId, useState, type ReactNode } from 'react';
import { ChevronLeft, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import dymLogoDark from '../../../assets/dym-logo-dark.png';
import { BRANCH_NAMES } from '../../../config/branches';
import type { BranchCode } from '../../../types/domain';
import type { SupportedLanguage } from '../../../locales/index';
import copy from './consentCopy.json';

interface ConsentScreenProps {
  branch: BranchCode | null;
  lang: SupportedLanguage;
  onSelectConsent: (examination: boolean, advertising: boolean) => void;
  onBack: () => void;
}

function BilingualText({ text }: { text: string }) {
  const separator = text.indexOf(' / ');
  if (separator < 0) return text;
  return <><span lang="vi">{text.slice(0, separator)}</span>{' / '}<span lang="en">{text.slice(separator + 3)}</span></>;
}

function ConsentSection({ sections, content, lang, value, onChange, children }: {
  sections: { number: number; title: string; paragraphs: string[] }[];
  content: Pick<typeof copy.vi.examination, 'title' | 'agree' | 'decline'>;
  lang: SupportedLanguage;
  value: boolean | null;
  onChange: (value: boolean) => void;
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className="flex flex-col gap-3" aria-labelledby={titleId}>
      <span id={titleId} className="sr-only"><BilingualText text={content.title} /></span>
      <div
        role="region"
        aria-labelledby={titleId}
        tabIndex={0}
        className="max-h-56 overflow-y-auto rounded-lg border border-border bg-muted/40 shadow-inner [scrollbar-gutter:stable] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:max-h-[360px]"
      >
        <div className="flex flex-col gap-4 p-4">
          {sections.map(({ number, title, paragraphs }, sectionIndex) => (
            <Fragment key={number}>
              {sectionIndex > 0 && <Separator />}
              <div className="flex flex-col gap-3 text-sm leading-relaxed">
                <h2 className="text-base font-bold leading-snug text-foreground">
                  {number}. <BilingualText text={title} />
                </h2>
                {paragraphs.map((paragraph, index) => (
                  <p key={paragraph} lang={lang === 'en' ? (index % 2 === 1 ? 'en' : 'vi') : lang}>{paragraph}</p>
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="sr-only"><BilingualText text={content.title} /></legend>
        {([true, false] as const).map(option => (
          <label
            key={String(option)}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-input px-3 py-2.5 text-sm transition-colors motion-reduce:transition-none has-[:where(:checked)]:border-primary has-[:where(:checked)]:bg-accent/60",
              option ? "hover:border-primary/60 hover:bg-primary/10" : "hover:border-destructive/60 hover:bg-destructive/10",
            )}
          >
            <input type="radio" name={titleId} checked={value === option} onChange={() => onChange(option)}
              className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
            <span className="font-bold"><BilingualText text={option ? content.agree : content.decline} /></span>
          </label>
        ))}
      </fieldset>
      {children}
    </section>
  );
}

export function ConsentScreen({ branch, lang, onSelectConsent, onBack }: ConsentScreenProps) {
  const [examination, setExamination] = useState<boolean | null>(null);
  const [advertising, setAdvertising] = useState<boolean | null>(null);
  const bilingual = lang === 'en';
  const content = copy[lang];
  const examinationParagraphCount = bilingual ? 2 : 1;
  const paragraphLanguage = (index: number) => bilingual ? (index === 0 ? 'vi' : 'en') : lang;
  return (
    <form className="animate-fade-in flex flex-col gap-5 py-2 [&_[lang=en]]:italic [&_[lang=en]]:text-primary" onSubmit={event => {
      event.preventDefault();
      if (examination !== null && advertising !== null) onSelectConsent(examination, advertising);
    }}>
      <header className="flex flex-col items-center gap-2 text-center">
        <img src={dymLogoDark} alt="DYM Medical Center Vietnam" className="h-12 w-auto" />
        {branch && <p className="rounded border border-dym-blue-100 bg-dym-blue-50 px-3 py-1 text-xs font-semibold text-dym-blue-800">{BRANCH_NAMES[branch]}</p>}
        <h1 className="text-xl font-semibold text-foreground">
          <span lang={paragraphLanguage(0)}>{content.title[0]}</span>
          {bilingual && <span lang="en" className="mt-1 block text-sm font-medium text-muted-foreground">{content.title[1]}</span>}
        </h1>
      </header>
      <div className="flex flex-col gap-1 text-sm leading-relaxed text-muted-foreground">
        {content.instructions.map((paragraph, index) => <p key={paragraph} lang={paragraphLanguage(index)}>{paragraph}</p>)}
      </div>
      <ConsentSection
        sections={[
          { number: 1, title: lang === 'ja' ? '受診への同意' : bilingual ? 'ĐỒNG Ý KHÁM / CONSENT TO EXAMINATION' : 'ĐỒNG Ý KHÁM', paragraphs: content.examination.paragraphs.slice(0, examinationParagraphCount) },
          { number: 2, title: lang === 'ja' ? '個人データの取り扱いへの同意' : bilingual ? 'ĐỒNG Ý CHO PHÉP XỬ LÝ DỮ LIỆU CÁ NHÂN / CONSENT TO PERSONAL DATA PROCESSING' : 'ĐỒNG Ý CHO PHÉP XỬ LÝ DỮ LIỆU CÁ NHÂN', paragraphs: content.examination.paragraphs.slice(examinationParagraphCount) },
        ]}
        content={content.examination} lang={lang} value={examination} onChange={setExamination}
      >
        {examination === false ? (
          <Alert variant="warning" className="border-warning/40 bg-warning/15 text-foreground">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription className="flex flex-col gap-1 font-semibold">
              {content.examination.warning.map((paragraph, index) => (
                <p key={paragraph} lang={paragraphLanguage(index)}>{paragraph}</p>
              ))}
            </AlertDescription>
          </Alert>
        ) : null}
      </ConsentSection>
      <ConsentSection
        sections={[{ number: 3, title: content.advertising.title, paragraphs: content.advertising.paragraphs }]}
        content={content.advertising} lang={lang} value={advertising} onChange={setAdvertising}
      />
      <div className="flex flex-col gap-1 text-sm leading-relaxed text-muted-foreground">
        {content.confirmation.map((paragraph, index) => <p key={paragraph} lang={paragraphLanguage(index)}>{paragraph}</p>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack}><ChevronLeft aria-hidden="true" />{lang === 'ja' ? '戻る' : bilingual ? 'Back' : 'Quay lại'}</Button>
        <Button type="submit" disabled={examination === null || advertising === null}>{lang === 'ja' ? '次へ' : bilingual ? 'Continue' : 'Tiếp tục'}</Button>
      </div>
    </form>
  );
}
