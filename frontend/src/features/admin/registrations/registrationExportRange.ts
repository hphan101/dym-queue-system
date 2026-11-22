import type { BranchCode } from '../../../types/domain';
import type { RegistrationDetails } from './types';
import { fetchRegistrationDay } from './useRegistrationDetailsQuery';

export type RegistrationExportPeriod = 'week' | 'month';

export function getRegistrationExportDates(date: string, period: RegistrationExportPeriod): string[] {
  const start = new Date(`${date}T00:00:00Z`);
  if (period === 'week') {
    start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  } else {
    start.setUTCDate(1);
  }

  const end = new Date(start);
  if (period === 'week') {
    end.setUTCDate(end.getUTCDate() + 7);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }

  const days: string[] = [];
  for (const day = start; day < end; day.setUTCDate(day.getUTCDate() + 1)) {
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

const CONCURRENT_DAYS = 4;

export async function fetchRegistrationExportRows(branch: BranchCode, dates: string[]): Promise<RegistrationDetails[]> {
  const rows: RegistrationDetails[] = [];
  for (let index = 0; index < dates.length; index += CONCURRENT_DAYS) {
    const batch = await Promise.all(dates.slice(index, index + CONCURRENT_DAYS).map((date) => fetchRegistrationDay(branch, date)));
    for (const day of batch) rows.push(...day);
  }
  return rows;
}
