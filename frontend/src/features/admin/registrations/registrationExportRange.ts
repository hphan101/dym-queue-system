import { supabase } from '../../../lib/supabaseClient';
import type { BranchCode } from '../../../types/domain';
import type { RegistrationDetails } from './types';

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

const PAGE_SIZE = 1000;
const CONCURRENT_DAYS = 4;

async function fetchExportDay(branch: BranchCode, date: string): Promise<RegistrationDetails[]> {
  const rows: RegistrationDetails[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc('get_registration_details', { p_branch_code: branch, p_queue_date: date })
      .order('queue_number')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as RegistrationDetails[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function fetchRegistrationExportRows(branch: BranchCode, dates: string[]): Promise<RegistrationDetails[]> {
  const rows: RegistrationDetails[] = [];
  for (let index = 0; index < dates.length; index += CONCURRENT_DAYS) {
    const batch = await Promise.all(dates.slice(index, index + CONCURRENT_DAYS).map((date) => fetchExportDay(branch, date)));
    for (const day of batch) rows.push(...day);
  }
  return rows;
}
