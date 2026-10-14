import { Badge } from '@astryxdesign/core/Badge';
import { Selector } from '@astryxdesign/core/Selector';
import {
  BellAlertIcon,
  BellSlashIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import type { BranchCode } from '../../../types/domain';

interface AdminHeaderProps {
  branch: BranchCode;
  branchOptions: Array<{ value: string; label: string }>;
  onBranchChange: (branch: BranchCode) => void;
  date: string;
  onDateChange: (date: string) => void;
  isNotificationSoundEnabled: boolean;
  onToggleNotificationSound: () => void;
}

export function AdminHeader({
  branch,
  branchOptions,
  onBranchChange,
  date,
  onDateChange,
  isNotificationSoundEnabled,
  onToggleNotificationSound,
}: AdminHeaderProps) {
  return (
    <header className="dym-command-bar">
      <div className="dym-command-copy">
        <div className="dym-eyebrow-row">
          <span className="dym-eyebrow">Bàn điều phối</span>
          <Badge label="Dữ liệu trực tiếp" variant="info" />
        </div>
        <h1>Quản lý lượt khám</h1>
        <p>Theo dõi hàng chờ và chuyển trạng thái tại từng chi nhánh.</p>
      </div>

      <div className="dym-topbar-filters" aria-label="Bộ lọc danh sách">
        <button
          type="button"
          className="dym-notification-toggle"
          data-enabled={isNotificationSoundEnabled}
          aria-pressed={isNotificationSoundEnabled}
          onClick={onToggleNotificationSound}
        >
          {isNotificationSoundEnabled ? (
            <BellAlertIcon aria-hidden="true" />
          ) : (
            <BellSlashIcon aria-hidden="true" />
          )}
          <span>
            {isNotificationSoundEnabled ? 'Âm báo bật' : 'Bật âm báo'}
          </span>
        </button>
        <div className="dym-branch-filter">
          <Selector
            label="Chi nhánh"
            isLabelHidden
            value={branch}
            options={branchOptions}
            onChange={(nextValue) => onBranchChange(nextValue as BranchCode)}
            startIcon={BuildingOffice2Icon}
            placement="below"
            width="100%"
          />
        </div>
        <label className="dym-date-field">
          <span>Ngày đăng ký</span>
          <div>
            <CalendarDaysIcon aria-hidden="true" />
            <input
              type="date"
              value={date}
              onChange={(event) => onDateChange(event.target.value)}
              aria-label="Ngày đăng ký"
            />
          </div>
        </label>
      </div>
    </header>
  );
}

