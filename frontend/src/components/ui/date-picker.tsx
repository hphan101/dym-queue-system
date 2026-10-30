import * as React from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getTodayInVietnam } from '@/lib/date';

/** Formats ISO 'YYYY-MM-DD' into 'DD/MM/YYYY' */
function formatDisplayDate(isoDate?: string | null): string {
  if (!isoDate) return '--/--/----';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return isoDate;
}

/** Formats ISO 'YYYY-MM' into 'Tháng MM/YYYY' */
function formatDisplayMonth(isoMonth?: string | null): string {
  if (!isoMonth) return '--/----';
  const parts = isoMonth.split('-');
  if (parts.length === 2) {
    const [year, month] = parts;
    return `Tháng ${month}/${year}`;
  }
  return isoMonth;
}

export interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (nextIsoDate: string) => void;
  ariaLabel?: string;
  title?: string;
  highlightWhenNotToday?: boolean;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function DatePicker({
  id,
  value,
  onChange,
  ariaLabel,
  title = 'Bấm để chọn ngày (Định dạng: Ngày/Tháng/Năm)',
  highlightWhenNotToday = false,
  align = 'start',
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const today = getTodayInVietnam();
  const isToday = value === today;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          size="sm"
          title={title}
          aria-label={ariaLabel ?? `Chọn ngày: ${formatDisplayDate(value)}`}
          className={cn(
            'h-9 gap-2 bg-card px-3 text-xs font-medium tabular-nums shadow-sm',
            highlightWhenNotToday &&
              !isToday &&
              'border-ring bg-accent text-accent-foreground hover:bg-accent/80',
            className,
          )}
        >
          <CalendarDays
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span>{formatDisplayDate(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0">
        <Calendar
          selected={value}
          todayIso={today}
          onSelect={(nextDate) => {
            onChange(nextDate);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

const SHORT_MONTHS = [
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

export interface MonthPickerProps {
  id?: string;
  value: string; // 'YYYY-MM'
  onChange: (nextIsoMonth: string) => void;
  ariaLabel?: string;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function MonthPicker({
  id,
  value,
  onChange,
  ariaLabel,
  align = 'start',
  className,
}: MonthPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'months' | 'years'>('months');
  const currentMonthIso = getTodayInVietnam().slice(0, 7);
  const currentYear = Number(currentMonthIso.split('-')[0]);

  const parsedYear = React.useMemo(() => {
    const yearNum = Number(value?.split('-')[0]);
    return Number.isFinite(yearNum) && yearNum > 1900
      ? yearNum
      : new Date().getFullYear();
  }, [value]);

  const [viewYear, setViewYear] = React.useState(parsedYear);
  const [yearPageStart, setYearPageStart] = React.useState(
    () => Math.floor(parsedYear / 12) * 12,
  );

  React.useEffect(() => {
    setViewYear(parsedYear);
    setYearPageStart(Math.floor(parsedYear / 12) * 12);
  }, [parsedYear]);

  const yearPageItems = React.useMemo(
    () => Array.from({ length: 12 }, (_, idx) => yearPageStart + idx),
    [yearPageStart],
  );

  const handleSelectMonth = (monthIndex: number) => {
    const nextIso = `${String(viewYear).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`;
    onChange(nextIso);
    setOpen(false);
  };

  const handleSelectCurrentMonth = () => {
    setMode('months');
    onChange(currentMonthIso);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setMode('months');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          size="sm"
          aria-label={ariaLabel ?? `Chọn tháng: ${formatDisplayMonth(value)}`}
          className={cn(
            'h-9 gap-2 bg-card px-3 text-xs font-medium tabular-nums shadow-sm',
            className,
          )}
        >
          <CalendarDays
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span>{formatDisplayMonth(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[256px] select-none p-3">
        <div className="mb-3 flex items-center justify-between gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              if (mode === 'years') {
                setYearPageStart((s) => Math.max(1900, s - 12));
              } else {
                setViewYear((y) => y - 1);
              }
            }}
            aria-label="Trước"
            className="size-7 bg-transparent p-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <Button
            type="button"
            variant={mode === 'years' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              setYearPageStart(Math.floor(viewYear / 12) * 12);
              setMode((m) => (m === 'years' ? 'months' : 'years'));
            }}
            className="h-7 gap-1 px-2.5 text-xs font-semibold tabular-nums"
          >
            <span>
              {mode === 'years'
                ? `${yearPageItems[0]} – ${yearPageItems[11]}`
                : `Năm ${viewYear}`}
            </span>
            <ChevronDown
              className={cn(
                'size-3 text-muted-foreground transition-transform',
                mode === 'years' && 'rotate-180',
              )}
            />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              if (mode === 'years') {
                setYearPageStart((s) => Math.min(2088, s + 12));
              } else {
                setViewYear((y) => y + 1);
              }
            }}
            aria-label="Tiếp"
            className="size-7 bg-transparent p-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {mode === 'years' ? (
          <div className="grid grid-cols-3 gap-1.5">
            {yearPageItems.map((yr) => {
              const isSelected = yr === viewYear;
              const isCurrent = yr === currentYear;
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => {
                    setViewYear(yr);
                    setMode('months');
                  }}
                  className={cn(
                    'inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
                    !isSelected &&
                      'text-foreground hover:bg-accent hover:text-accent-foreground',
                    isCurrent &&
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
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {SHORT_MONTHS.map((label, idx) => {
              const cellIso = `${String(viewYear).padStart(4, '0')}-${String(idx + 1).padStart(2, '0')}`;
              const isSelected = cellIso === value;
              const isCurrent = cellIso === currentMonthIso;

              return (
                <button
                  key={cellIso}
                  type="button"
                  onClick={() => handleSelectMonth(idx)}
                  className={cn(
                    'inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
                    !isSelected &&
                      'text-foreground hover:bg-accent hover:text-accent-foreground',
                    isCurrent &&
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

        <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            Hiện tại: {currentMonthIso.split('-').reverse().join('/')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSelectCurrentMonth}
            className="h-7 px-2.5 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary"
          >
            Tháng này
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
