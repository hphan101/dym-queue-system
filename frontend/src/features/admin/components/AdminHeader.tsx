import { type ReactNode } from 'react';
import {
  VolumeX,
  Volume2,
  Hospital,
  CalendarCheck,
  UserRoundPlus,
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
import { openStaffTab } from '../../../lib/navigation';
import '../adminHeader.css';
import { AdminBreadcrumb } from './AdminBreadcrumb';
import type { AdminBreadcrumbItem } from './adminBreadcrumbs';

export interface AdminHeaderProps {
  breadcrumbs?: AdminBreadcrumbItem[];
  title?: string;
  branch?: BranchCode;
  branchOptions?: Array<{ value: string; label: string }>;
  onBranchChange?: (branch: BranchCode) => void;
  date?: string;
  onDateChange?: (date: string) => void;
  isNotificationSoundEnabled?: boolean;
  onToggleNotificationSound?: () => void;
  actions?: ReactNode;
  registrationHref?: string;
}

export function AdminHeader({
  breadcrumbs,
  title = 'Tiếp nhận',
  branch,
  branchOptions = [],
  onBranchChange,
  date,
  onDateChange,
  isNotificationSoundEnabled,
  onToggleNotificationSound,
  actions,
  registrationHref,
}: AdminHeaderProps) {
  const today = getTodayInVietnam();
  const isToday = !date || date === today;

  return (
    <header className="dym-admin-header-bar">
      {/* Page Title */}
      <div className="dym-header-branding">
        <AdminBreadcrumb items={breadcrumbs} />
        <h1 className="dym-header-title">{title}</h1>
      </div>

      {/* Control Filter Bar */}
      <div
        className="dym-header-controls"
        aria-label="Bộ lọc điều phối"
      >
        {registrationHref && <Button type="button" size="sm" className="dym-header-register gap-2 px-4"
          onClick={() => openStaffTab(registrationHref)} title="Mở đăng ký hộ khách trong tab mới">
          <UserRoundPlus aria-hidden="true" />Đăng ký
        </Button>}
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
              'gap-2 bg-card px-3 shadow-none',
              isNotificationSoundEnabled &&
                'border-ring bg-accent text-accent-foreground hover:bg-accent/80',
            )}
          >
            {isNotificationSoundEnabled ? (
              <Volume2 aria-hidden="true" />
            ) : (
              <VolumeX aria-hidden="true" />
            )}
            <span>
              {isNotificationSoundEnabled ? 'Âm báo: Bật' : 'Âm báo: Tắt'}
            </span>
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
              className="dym-header-branch bg-card px-3 shadow-none"
            >
              <div className="flex min-w-0 items-center gap-1.5 truncate">
                <Hospital aria-hidden="true" />
                <SelectValue placeholder="Chọn cơ sở" />
              </div>
            </SelectTrigger>
            <SelectContent align="end" className="dym-header-branch-menu min-w-[260px]">
              <SelectGroup>
                {branchOptions.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-sm"
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
          <div className="dym-header-date flex items-center gap-2">
            <DatePicker
              id="date-select-btn"
              value={date}
              onChange={onDateChange}
              ariaLabel={`Ngày tiếp nhận: ${formatDisplayDate(date)}`}
              highlightWhenNotToday
              align="end"
              className="gap-2 px-3 shadow-none"
            />

            {!isToday && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDateChange(today)}
                title="Quay về ngày hôm nay"
                className="gap-2 px-3 text-muted-foreground hover:text-foreground"
              >
                <CalendarCheck aria-hidden="true" />
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
