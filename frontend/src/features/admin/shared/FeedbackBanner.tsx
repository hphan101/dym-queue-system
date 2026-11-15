import { X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FeedbackBannerProps {
  message: string;
  variant: 'success' | 'destructive';
  onDismiss: () => void;
}

export function FeedbackBanner({ message, variant, onDismiss }: FeedbackBannerProps) {
  return (
    <Alert variant={variant} role={variant === 'success' ? 'status' : 'alert'}
      aria-live={variant === 'success' ? 'polite' : undefined} className="mb-4">
      <AlertDescription className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 font-medium">{message}</span>
        <button type="button" onClick={onDismiss}
          aria-label={variant === 'success' ? 'Đóng thông báo' : 'Đóng thông báo lỗi'}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100">
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </AlertDescription>
    </Alert>
  );
}
