import { useRef, type ReactNode } from 'react';
import {
  BellAlertIcon,
  BellSlashIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
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
  const dateInputRef = useRef<HTMLInputElement>(null);
  const today = getTodayInVietnam();
  const isToday = !date || date === today;

  const handleOpenDatePicker = () => {
    try {
      if (dateInputRef.current && 'showPicker' in HTMLInputElement.prototype) {
        dateInputRef.current.showPicker();
      } else {
        dateInputRef.current?.focus();
      }
    } catch {
      dateInputRef.current?.focus();
    }
  };

  return (
    <header className="dym-admin-header-bar">
      {/* Page Title */}
      <div className="dym-header-branding">
        <h1 className="dym-header-title">{title}</h1>
      </div>

      {/* Control Filter Bar */}
      <div className="dym-header-controls" aria-label="Bộ lọc điều phối">
        {/* Sound Toggle (if configured) */}
        {isNotificationSoundEnabled !== undefined && onToggleNotificationSound && (
          <button
            type="button"
            className={`dym-btn-sound ${
              isNotificationSoundEnabled ? 'is-enabled' : 'is-disabled'
            }`}
            aria-pressed={isNotificationSoundEnabled}
            onClick={onToggleNotificationSound}
            title={
              isNotificationSoundEnabled
                ? 'Chuông âm báo đang bật khi có khách quét QR mới'
                : 'Âm báo đang tắt. Bấm để bật chuông thông báo'
            }
          >
            {isNotificationSoundEnabled ? (
              <BellAlertIcon className="dym-sound-icon text-dym-blue-600" aria-hidden="true" />
            ) : (
              <BellSlashIcon className="dym-sound-icon text-slate-400" aria-hidden="true" />
            )}
            <span className="dym-sound-label">
              {isNotificationSoundEnabled ? 'Âm báo bật' : 'Bật âm báo'}
            </span>
            <span
              className={`dym-sound-indicator-led ${
                isNotificationSoundEnabled ? 'led-on' : 'led-off'
              }`}
            />
          </button>
        )}

        {/* Branch Selection Dropdown (if configured) */}
        {branch && onBranchChange && branchOptions.length > 0 && (
          <div className="dym-control-group">
            <label htmlFor="branch-select" className="dym-control-label">
              <BuildingOffice2Icon className="w-3.5 h-3.5" />
              <span>Cơ sở phòng khám</span>
            </label>
            <div className="dym-select-wrapper">
              <select
                id="branch-select"
                value={branch}
                onChange={(e) => onBranchChange(e.target.value as BranchCode)}
                className="dym-control-select"
              >
                {branchOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Date Selection (if configured) */}
        {date !== undefined && onDateChange && (
          <div className="dym-control-group">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="date-select-btn" className="dym-control-label">
                <CalendarDaysIcon className="w-3.5 h-3.5" />
                <span>Ngày tiếp nhận</span>
              </label>
              {!isToday && (
                <button
                  type="button"
                  className="dym-btn-today-link"
                  onClick={() => onDateChange(today)}
                  title="Quay về ngày hôm nay"
                >
                  Về hôm nay
                </button>
              )}
            </div>
            <div className="dym-date-wrapper">
              <button
                type="button"
                id="date-select-btn"
                className="dym-control-date-btn"
                onClick={handleOpenDatePicker}
                title="Bấm để chọn ngày (Định dạng: Ngày/Tháng/Năm)"
                aria-label={`Ngày tiếp nhận: ${formatDisplayDate(date)}`}
              >
                <span className="dym-control-date-value">
                  {formatDisplayDate(date)}
                </span>
                <CalendarDaysIcon className="dym-control-date-icon" aria-hidden="true" />
              </button>
              <input
                ref={dateInputRef}
                id="date-select"
                type="date"
                value={date}
                onChange={(e) => {
                  if (e.target.value) {
                    onDateChange(e.target.value);
                  }
                }}
                className="dym-native-date-hidden"
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>
          </div>
        )}

        {/* Actions Slot */}
        {actions && <div className="dym-header-actions-slot">{actions}</div>}
      </div>
    </header>
  );
}
