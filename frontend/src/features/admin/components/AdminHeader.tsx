import { type ReactNode } from 'react';
import {
  BellOff,
  BellRing,
  Building2,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { BranchCode } from '../../../types/domain';
import { getTodayInVietnam } from '../../../lib/date';
import { formatDisplayDate } from '../utils/adminFormatters';

export interface AdminHeaderProps {
  title?: string;
  branch?: BranchCode;
  branchOptions?: Array<{ value: string; label: string }>;
  onBranchChange?: (branch: BranchCode) => void;
  date?: string;
  onDateChange?: (date: string) => void;
  isNotificationSoundEnabled?: boolean;
  onToggleNotificationSound?: () => void;
  actions?: ReactNode;
}

export function AdminHeader({
  title = 'Tiếp nhận',
  branch,
  branchOptions = [],
  onBranchChange,
  date,
  onDateChange,
  isNotificationSoundEnabled,
  onToggleNotificationSound,
  actions,
}: AdminHeaderProps) {
  const today = getTodayInVietnam();
  const isToday = !date || date === today;

  return (
    <header className="dym-admin-header-bar">
      {/* Page Title */}
      <div className="dym-header-branding">
        <h1 className="dym-header-title">{title}</h1>
      </div>

      {/* Control Filter Bar */}
      <div
        className="flex flex-wrap items-center justify-end gap-2.5"
        aria-label="Bộ lọc điều phối"
      >
        {/* Sound Toggle (if configured) */}
        {isNotificationSoundEnabled !== undefined && onToggleNotificationSound && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={isNotificationSoundEnabled}
            onClick={onToggleNotificationSound}
            title={
              isNotificationSoundEnabled
                ? 'Chuông âm báo đang bật khi có khách quét QR mới'
                : 'Âm báo đang tắt. Bấm để bật chuông thông báo'
            }
            className={cn(
              'h-9 gap-2 bg-card px-3 text-xs font-medium shadow-sm',
              isNotificationSoundEnabled &&
                'border-ring bg-accent text-accent-foreground hover:bg-accent/80',
            )}
          >
            {isNotificationSoundEnabled ? (
              <BellRing className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <BellOff
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <span>
              {isNotificationSoundEnabled ? 'Âm báo bật' : 'Bật âm báo'}
            </span>
            <span
              className={cn(
                'size-2 rounded-full',
                isNotificationSoundEnabled
                  ? 'bg-emerald-500'
                  : 'bg-muted-foreground/40',
              )}
              aria-hidden="true"
            />
          </Button>
        )}

        {/* Branch Selection Dropdown (shadcn Select) */}
        {branch && onBranchChange && branchOptions.length > 0 && (
          <Select
            value={branch}
            onValueChange={(value) => onBranchChange(value as BranchCode)}
          >
            <SelectTrigger
              id="branch-select"
              aria-label="Cơ sở phòng khám"
              className="h-9 w-[220px] bg-card px-3 text-xs font-medium shadow-sm"
            >
              <div className="flex min-w-0 items-center gap-1.5 truncate">
                <Building2
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <SelectValue placeholder="Chọn cơ sở" />
              </div>
            </SelectTrigger>
            <SelectContent align="end" className="w-[220px]">
              <SelectGroup>
                {branchOptions.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-xs"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}

        {/* Date Selection (if configured) */}
        {date !== undefined && onDateChange && (
          <div className="relative flex items-center gap-1.5">
            <DatePicker
              id="date-select-btn"
              value={date}
              onChange={onDateChange}
              ariaLabel={`Ngày tiếp nhận: ${formatDisplayDate(date)}`}
              highlightWhenNotToday
              align="end"
            />

            {!isToday && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDateChange(today)}
                title="Quay về ngày hôm nay"
                className="h-9 gap-1 px-2.5 text-xs font-medium text-primary hover:text-primary"
              >
                <RotateCcw className="size-3.5 shrink-0" aria-hidden="true" />
                <span>Hôm nay</span>
              </Button>
            )}
          </div>
        )}

        {/* Actions Slot */}
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}
