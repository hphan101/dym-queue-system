import { UserRoundPlus, X } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

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
    <div className="fixed right-4 top-4 z-20 w-[calc(100vw-2rem)] max-w-sm text-foreground">
      <Alert role="status" aria-live="polite" aria-atomic="true" className="pr-12 shadow-md">
        <UserRoundPlus className="size-4" aria-hidden="true" />
        <AlertTitle className="font-semibold text-white">Khách mới đăng ký</AlertTitle>
        <AlertDescription className="break-words">
          Số {notification.queueNumber} · {notification.fullName}
        </AlertDescription>
      </Alert>
      <Button type="button" variant="ghost" size="icon-sm" className="absolute right-2 top-2 text-white hover:bg-white/15 hover:text-white focus-visible:ring-white"
        aria-label="Đóng thông báo" onClick={onClose}>
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
