export type QueueStatus = 'waiting' | 'called';

export type RealtimeConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'offline';

export const REALTIME_REGISTRATION_COLUMNS = [
  'id',
  'branch_id',
  'queue_date',
  'queue_number',
  'full_name',
  'phone_number',
  'state',
  'registered_at',
  'first_called_at',
  'last_called_at',
  'updated_at',
];

export const STATUS_META: Record<
  QueueStatus,
  { label: string; badge: 'warning' | 'success'; dot: 'warning' | 'success' }
> = {
  waiting: { label: 'Chờ gọi', badge: 'warning', dot: 'warning' },
  called: { label: 'Đã gọi', badge: 'success', dot: 'success' },
};

export const STATUS_ORDER: QueueStatus[] = ['waiting', 'called'];


