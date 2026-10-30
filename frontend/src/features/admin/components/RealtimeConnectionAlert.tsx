import { SignalSlashIcon } from '@heroicons/react/24/outline';
import type { RealtimeConnectionState } from '../constants/queueConstants';

export function RealtimeConnectionAlert({
  state,
}: {
  state: RealtimeConnectionState;
}) {
  if (state !== 'offline' && state !== 'disconnected') {
    return null;
  }

  return (
    <div
      className="dym-connection-alert"
      data-state={state}
      role="status"
      aria-live="polite"
    >
      <SignalSlashIcon className="w-5 h-5 shrink-0" aria-hidden="true" />
      <div>
        <strong>
          {state === 'offline'
            ? 'Thiết bị đang mất Internet'
            : 'Mất kết nối Supabase Realtime'}
        </strong>
        <span>
          {state === 'offline'
            ? 'Dữ liệu sẽ tự đồng bộ lại khi có mạng.'
            : 'Hệ thống đang tự thử kết nối lại, không cần tải lại trang.'}
        </span>
      </div>
    </div>
  );
}
