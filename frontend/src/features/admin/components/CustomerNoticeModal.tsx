import { BellAlertIcon, XMarkIcon } from '@heroicons/react/24/outline';

export interface CustomerNotificationItem {
  id: string;
  queueNumber: string;
  fullName: string;
}

interface CustomerNoticeModalProps {
  notification: CustomerNotificationItem | null;
  onClose: () => void;
}

export function CustomerNoticeModal({
  notification,
  onClose,
}: CustomerNoticeModalProps) {
  if (!notification) return null;

  return (
    <div className="dym-customer-notification" role="status" aria-live="polite">
      <span className="dym-customer-notification-icon" aria-hidden="true">
        <BellAlertIcon />
      </span>
      <div>
        <strong>Khách mới đăng ký</strong>
        <p>
          Số {notification.queueNumber} · {notification.fullName}
        </p>
      </div>
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={onClose}
      >
        <XMarkIcon aria-hidden="true" />
      </button>
    </div>
  );
}

