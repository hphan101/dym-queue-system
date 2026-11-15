export type ReceptionTrendPeriod = 'daily' | 'monthly';
export interface ReceptionDailyCount { queue_date: string; total: number }
export interface ReceptionTrendPoint { date: string; label: string; fullLabel: string; count: number }

export function buildReceptionTrend(
  rows: ReceptionDailyCount[],
  selectedDate: string,
  period: ReceptionTrendPeriod,
  today: string,
): ReceptionTrendPoint[] {
  const year = Number(selectedDate.slice(0, 4));
  const month = Number(selectedDate.slice(5, 7));
  const monthKey = selectedDate.slice(0, 7);
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.queue_date.slice(0, 4) !== String(year) || row.queue_date > today) continue;
    const key = period === 'daily' ? row.queue_date : row.queue_date.slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + Number(row.total));
  }
  const length = period === 'daily'
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 12;
  return Array.from({ length }, (_, index) => {
    const part = String(index + 1).padStart(2, '0');
    const date = period === 'daily' ? `${monthKey}-${part}` : `${year}-${part}`;
    return {
      date,
      label: period === 'daily' ? part : `T${index + 1}`,
      fullLabel: period === 'daily' ? `${part}/${String(month).padStart(2, '0')}/${year}` : `Tháng ${index + 1}/${year}`,
      count: counts.get(date) ?? 0,
    };
  }).filter((point) => point.date <= today.slice(0, period === 'daily' ? 10 : 7));
}
