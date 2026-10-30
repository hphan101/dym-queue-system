import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getTodayInVietnam } from '@/lib/date';

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

const MONTH_LABELS = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
] as const;

const SHORT_MONTH_LABELS = [
  'Thg 01',
  'Thg 02',
  'Thg 03',
  'Thg 04',
  'Thg 05',
  'Thg 06',
  'Thg 07',
  'Thg 08',
  'Thg 09',
  'Thg 10',
  'Thg 11',
  'Thg 12',
] as const;

type CalendarViewMode = 'days' | 'months' | 'years';

interface ParsedYearMonthDay {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

function isValidYearMonthDay(
  year: number,
  month: number,
  day: number,
): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  const maxDays = new Date(year, month, 0).getDate();
  return day >= 1 && day <= maxDays;
}

function parseIsoDate(iso?: string | null): ParsedYearMonthDay | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidYearMonthDay(year, month, day)) return null;
  return { year, month, day };
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isoToDisplayDmy(iso?: string | null): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return '';
  return `${String(parsed.day).padStart(2, '0')}/${String(parsed.month).padStart(2, '0')}/${String(parsed.year).padStart(4, '0')}`;
}

function parseUserDmyInput(raw: string): ParsedYearMonthDay | null {
  const trimmed = raw.trim();
  const slashMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    if (isValidYearMonthDay(year, month, day)) {
      return { year, month, day };
    }
    return null;
  }

  const digitsOnly = /^(\d{2})(\d{2})(\d{4})$/.exec(trimmed);
  if (digitsOnly) {
    const day = Number(digitsOnly[1]);
    const month = Number(digitsOnly[2]);
    const year = Number(digitsOnly[3]);
    if (isValidYearMonthDay(year, month, day)) {
      return { year, month, day };
    }
  }

  return null;
}

function formatTypingDmy(raw: string): string {
  if (raw.includes('/') || raw.includes('-')) {
    return raw.slice(0, 10);
  }
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

interface CalendarCell {
  iso: string;
  day: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
}

function buildCalendarGrid(year: number, month: number): CalendarCell[] {
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInCurrentMonth = new Date(year, month, 0).getDate();

  const prevMonthYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const daysInPrevMonth = new Date(prevMonthYear, prevMonth, 0).getDate();

  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const cells: CalendarCell[] = [];

  for (let i = startOffset - 1; i >= 0; i -= 1) {
    const day = daysInPrevMonth - i;
    cells.push({
      iso: toIsoDate(prevMonthYear, prevMonth, day),
      day,
      month: prevMonth,
      year: prevMonthYear,
      isCurrentMonth: false,
    });
  }

  for (let day = 1; day <= daysInCurrentMonth; day += 1) {
    cells.push({
      iso: toIsoDate(year, month, day),
      day,
      month,
      year,
      isCurrentMonth: true,
    });
  }

  const remaining = 42 - cells.length;
  for (let day = 1; day <= remaining; day += 1) {
    cells.push({
      iso: toIsoDate(nextMonthYear, nextMonth, day),
      day,
      month: nextMonth,
      year: nextMonthYear,
      isCurrentMonth: false,
    });
  }

  return cells;
}

export interface CalendarProps {
  selected?: string;
  onSelect?: (isoDate: string) => void;
  todayIso?: string;
  showTodayButton?: boolean;
  className?: string;
}

export function Calendar({
  selected,
  onSelect,
  todayIso,
  showTodayButton = true,
  className,
}: CalendarProps) {
  const resolvedToday = todayIso ?? getTodayInVietnam();
  const parsedToday = parseIsoDate(resolvedToday);
  const initialParsed =
    parseIsoDate(selected) ??
    parsedToday ?? {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      day: new Date().getDate(),
    };

  const [viewMode, setViewMode] = React.useState<CalendarViewMode>('days');
  const [viewYear, setViewYear] = React.useState(initialParsed.year);
  const [viewMonth, setViewMonth] = React.useState(initialParsed.month);
  const [yearPageStart, setYearPageStart] = React.useState(
    () => Math.floor(initialParsed.year / 12) * 12,
  );
  const [manualInput, setManualInput] = React.useState(() =>
    isoToDisplayDmy(selected ?? resolvedToday),
  );
  const [isInputInvalid, setIsInputInvalid] = React.useState(false);

  React.useEffect(() => {
    const parsed = parseIsoDate(selected);
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
      setYearPageStart(Math.floor(parsed.year / 12) * 12);
      setManualInput(isoToDisplayDmy(selected));
      setIsInputInvalid(false);
    }
  }, [selected]);

  const cells = React.useMemo(
    () => buildCalendarGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const yearPageItems = React.useMemo(
    () => Array.from({ length: 12 }, (_, idx) => yearPageStart + idx),
    [yearPageStart],
  );

  const handlePrev = () => {
    if (viewMode === 'years') {
      setYearPageStart((start) => Math.max(1900, start - 12));
      return;
    }
    if (viewMode === 'months') {
      setViewYear((y) => y - 1);
      return;
    }
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNext = () => {
    if (viewMode === 'years') {
      setYearPageStart((start) => Math.min(2088, start + 12));
      return;
    }
    if (viewMode === 'months') {
      setViewYear((y) => y + 1);
      return;
    }
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleManualInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted =
      raw.length > manualInput.length ? formatTypingDmy(raw) : raw;
    setManualInput(formatted);

    const parsed = parseUserDmyInput(formatted);
    if (parsed) {
      setIsInputInvalid(false);
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
      setYearPageStart(Math.floor(parsed.year / 12) * 12);
      setViewMode('days');
    } else {
      setIsInputInvalid(formatted.trim().length >= 10);
    }
  };

  const commitManualInput = () => {
    const parsed = parseUserDmyInput(manualInput);
    if (parsed) {
      setIsInputInvalid(false);
      const nextIso = toIsoDate(parsed.year, parsed.month, parsed.day);
      onSelect?.(nextIso);
    } else {
      setIsInputInvalid(true);
    }
  };

  const handleSelectToday = () => {
    if (parsedToday) {
      setViewYear(parsedToday.year);
      setViewMonth(parsedToday.month);
      setYearPageStart(Math.floor(parsedToday.year / 12) * 12);
    }
    setViewMode('days');
    setManualInput(isoToDisplayDmy(resolvedToday));
    setIsInputInvalid(false);
    onSelect?.(resolvedToday);
  };

  return (
    <div className={cn('w-[280px] select-none p-3', className)}>
      {/* Quick Manual Date Input (DD/MM/YYYY) */}
      <div className="mb-2.5 flex items-center gap-1.5">
        <Input
          type="text"
          inputMode="numeric"
          value={manualInput}
          onChange={handleManualInputChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitManualInput();
            }
          }}
          placeholder="DD/MM/YYYY (VD: 01/01/2000)"
          aria-label="Nhập nhanh ngày tháng năm (DD/MM/YYYY)"
          aria-invalid={isInputInvalid}
          className={cn(
            'h-8 bg-background px-2.5 text-xs font-medium tabular-nums',
            isInputInvalid &&
              'border-destructive focus-visible:ring-destructive/30',
          )}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={commitManualInput}
          className="h-8 shrink-0 px-2.5 text-xs font-medium"
        >
          Chọn
        </Button>
      </div>

      {/* Navigation Header */}
      <div className="mb-2.5 flex items-center justify-between gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handlePrev}
          aria-label="Trước"
          className="size-7 shrink-0 bg-transparent p-0 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div className="flex flex-1 items-center justify-center gap-1">
          <Button
            type="button"
            variant={viewMode === 'months' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() =>
              setViewMode((mode) => (mode === 'months' ? 'days' : 'months'))
            }
            className="h-7 gap-1 px-2 text-xs font-semibold"
          >
            <span>{MONTH_LABELS[viewMonth - 1]}</span>
            <ChevronDown
              className={cn(
                'size-3 text-muted-foreground transition-transform',
                viewMode === 'months' && 'rotate-180',
              )}
            />
          </Button>

          <Button
            type="button"
            variant={viewMode === 'years' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              setYearPageStart(Math.floor(viewYear / 12) * 12);
              setViewMode((mode) => (mode === 'years' ? 'days' : 'years'));
            }}
            className="h-7 gap-1 px-2 text-xs font-semibold tabular-nums"
          >
            <span>
              {viewMode === 'years'
                ? `${yearPageItems[0]} – ${yearPageItems[11]}`
                : viewYear}
            </span>
            <ChevronDown
              className={cn(
                'size-3 text-muted-foreground transition-transform',
                viewMode === 'years' && 'rotate-180',
              )}
            />
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleNext}
          aria-label="Tiếp"
          className="size-7 shrink-0 bg-transparent p-0 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* View Mode 1: 12-Year Grid */}
      {viewMode === 'years' && (
        <div className="grid min-h-[224px] grid-cols-3 content-center gap-1.5 py-1">
          {yearPageItems.map((yr) => {
            const isSelected = yr === viewYear;
            const isCurrentYear = yr === parsedToday?.year;
            return (
              <button
                key={yr}
                type="button"
                onClick={() => {
                  setViewYear(yr);
                  setViewMode('months');
                }}
                className={cn(
                  'inline-flex h-10 items-center justify-center rounded-md text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
                  !isSelected &&
                    'text-foreground hover:bg-accent hover:text-accent-foreground',
                  isCurrentYear &&
                    !isSelected &&
                    'bg-accent/70 font-semibold text-accent-foreground ring-1 ring-border',
                  isSelected &&
                    'bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90',
                )}
              >
                {yr}
              </button>
            );
          })}
        </div>
      )}

      {/* View Mode 2: 12-Month Grid */}
      {viewMode === 'months' && (
        <div className="grid min-h-[224px] grid-cols-3 content-center gap-1.5 py-1">
          {SHORT_MONTH_LABELS.map((label, idx) => {
            const monthNum = idx + 1;
            const isSelected = monthNum === viewMonth;
            const isCurrentMonth =
              viewYear === parsedToday?.year && monthNum === parsedToday?.month;

            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setViewMonth(monthNum);
                  setViewMode('days');
                }}
                className={cn(
                  'inline-flex h-10 items-center justify-center rounded-md text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
                  !isSelected &&
                    'text-foreground hover:bg-accent hover:text-accent-foreground',
                  isCurrentMonth &&
                    !isSelected &&
                    'bg-accent/70 font-semibold text-accent-foreground ring-1 ring-border',
                  isSelected &&
                    'bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* View Mode 3: Days Grid */}
      {viewMode === 'days' && (
        <>
          <div className="mb-1 grid grid-cols-7 text-center">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="flex h-7 items-center justify-center text-[11px] font-medium text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5 text-center">
            {cells.map((cell) => {
              const isSelected = cell.iso === selected;
              const isToday = cell.iso === resolvedToday;

              return (
                <div
                  key={cell.iso}
                  className="flex items-center justify-center p-0"
                >
                  <button
                    type="button"
                    onClick={() => onSelect?.(cell.iso)}
                    className={cn(
                      'inline-flex size-8 items-center justify-center rounded-md text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
                      !cell.isCurrentMonth &&
                        !isSelected &&
                        'text-muted-foreground/45 hover:bg-accent/50 hover:text-muted-foreground',
                      cell.isCurrentMonth &&
                        !isSelected &&
                        'text-foreground hover:bg-accent hover:text-accent-foreground',
                      isToday &&
                        !isSelected &&
                        'bg-accent/70 font-semibold text-accent-foreground ring-1 ring-border',
                      isSelected &&
                        'bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90',
                    )}
                  >
                    {cell.day}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Footer */}
      {showTodayButton && (
        <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            Hôm nay: {resolvedToday.split('-').reverse().join('/')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSelectToday}
            className="h-7 px-2.5 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary"
          >
            Hôm nay
          </Button>
        </div>
      )}
    </div>
  );
}
