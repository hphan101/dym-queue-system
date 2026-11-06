import { supabase } from '../../../lib/supabaseClient';
import type { OnsiteScheduleInput, RosterSchedule } from './rosterService';
import { ROSTER_SCHEDULE_SELECT, normalizeRosterSchedule } from './rosterService';

export function groupOnsiteWeek(dates: string[], branch: string, schedules: RosterSchedule[], type = 'all'): Map<string, RosterSchedule[]> {
  const days = new Map(dates.map((date) => [date, [] as RosterSchedule[]]));
  for (const campaign of schedules) {
    if (campaign.schedule_type !== 'insite' && campaign.branch_code === branch && (type === 'all' || campaign.schedule_type === type)) {
      days.get(campaign.schedule_date)?.push(campaign);
    }
  }
  for (const campaigns of days.values()) campaigns.sort((a, b) => a.company_name.localeCompare(b.company_name, 'vi') || (a.campaign_code ?? '').localeCompare(b.campaign_code ?? ''));
  return days;
}

export async function fetchOnsiteWeek(start: string, end: string): Promise<RosterSchedule[]> {
  const { data, error } = await supabase.from('roster_schedules').select(ROSTER_SCHEDULE_SELECT)
    .neq('schedule_type', 'insite').gte('schedule_date', start).lte('schedule_date', end);
  if (error) throw new Error(error.message || 'Không tải được lịch đoàn.');
  return ((data ?? []) as RosterSchedule[]).map(normalizeRosterSchedule);
}

export function buildMultiDayCampaigns(input: OnsiteScheduleInput, dates: string[]): OnsiteScheduleInput[] {
  const sorted = [...new Set(dates)].sort();
  if (!sorted.length) throw new Error('Vui lòng chọn ít nhất một ngày khám.');
  for (const date of sorted) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error('Ngày khám không hợp lệ.');
    }
  }
  return sorted.map((date, index) => ({ ...input, id: null, schedule_date: date,
    campaign_code: /^DOAN-\d{8}-/i.test(input.campaign_code)
      ? input.campaign_code.replace(/^(DOAN-)\d{8}(-)/i, (_, prefix, separator) => `${prefix}${date.replace(/-/g, '')}${separator}`)
      : index === 0 ? input.campaign_code : `${input.campaign_code}-${date.replace(/-/g, '')}`,
  }));
}
