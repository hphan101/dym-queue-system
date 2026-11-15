import { WifiOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { RealtimeConnectionState } from '../reception/queueConstants';

export function RealtimeConnectionAlert({ state }: { state: RealtimeConnectionState }) {
  if (state !== 'offline' && state !== 'disconnected') return null;
  return (
    <Alert variant="warning" className="mb-4" data-state={state} role="status" aria-live="polite">
      <WifiOff className="size-4" aria-hidden="true" />
      <AlertTitle>{state === 'offline' ? 'Thiết bị đang mất Internet' : 'Mất kết nối Supabase Realtime'}</AlertTitle>
      <AlertDescription>{state === 'offline'
        ? 'Dữ liệu sẽ tự đồng bộ lại khi có mạng.'
        : 'Hệ thống đang tự thử kết nối lại, không cần tải lại trang.'}</AlertDescription>
    </Alert>
  );
}
