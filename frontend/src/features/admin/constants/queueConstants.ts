export type QueueStatus = 'waiting' | 'called';

export const STATUS_META: Record<
  QueueStatus,
  { label: string; badge: 'warning' | 'success'; dot: 'warning' | 'success' }
> = {
  waiting: { label: 'Chờ gọi', badge: 'warning', dot: 'warning' },
  called: { label: 'Đã gọi', badge: 'success', dot: 'success' },
};

export const STATUS_ORDER: QueueStatus[] = ['waiting', 'called'];

