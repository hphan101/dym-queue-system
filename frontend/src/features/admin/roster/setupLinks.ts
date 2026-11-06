import { supabase } from '../../../lib/supabaseClient';
import type { RosterSchedule } from './rosterService';

export function groupHcSchedules(schedules: RosterSchedule[]) {
  const groups = new Map<string, RosterSchedule[]>();
  for (const schedule of schedules) {
    if (schedule.schedule_type !== 'onsite_exam') continue;
    const key = schedule.campaign_group_id ?? schedule.id;
    const items = groups.get(key) ?? [];
    items.push(schedule); groups.set(key, items);
  }
  return [...groups].map(([id, items]) => ({ id, items: items.sort((a, b) => a.schedule_date.localeCompare(b.schedule_date)) }));
}

export function setupCaption(schedule: RosterSchedule): string {
  const targets = schedule.setup_targets ?? [];
  if (!targets.length) return schedule.setup_onsite_ids?.length ? `Liên kết ${schedule.setup_onsite_ids.length} ngày Onsite HC` : 'Chưa liên kết đoàn HC';
  const dates = [...new Set(targets.map((item) => item.schedule_date))].sort().map((date) => date.split('-').reverse().join('/'));
  return `Thuộc đoàn khám ${targets[0].company_name || targets[0].campaign_code || 'Onsite HC'} · Ngày khám ${dates.join(', ')}`;
}

export async function fetchHcChoices(branch: string): Promise<RosterSchedule[]> {
  const schedules: RosterSchedule[] = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await supabase.from('roster_schedules').select('*').eq('schedule_type', 'onsite_exam')
      .eq('branch_code', branch).order('schedule_date', { ascending: false }).order('id').range(offset, offset + 199);
    if (error) throw new Error(error.message || 'Không tải được đoàn Onsite HC.');
    schedules.push(...(data ?? []) as RosterSchedule[]);
    if (!data || data.length < 200) return schedules;
  }
}

export type SetupRelationCampaign = Pick<RosterSchedule, 'id' | 'schedule_type' | 'campaign_group_id' | 'setup_onsite_ids'>;

export async function fetchCampaignRelations(campaign: SetupRelationCampaign): Promise<RosterSchedule[]> {
  if (campaign.schedule_type === 'setup') {
    if (!campaign.setup_onsite_ids?.length) return [];
    const { data, error } = await supabase.from('roster_schedules').select('*').in('id', campaign.setup_onsite_ids).order('schedule_date');
    if (error) throw new Error(error.message || 'Không tải được đoàn khám liên quan.');
    return (data ?? []) as RosterSchedule[];
  }
  let query = supabase.from('roster_schedules').select('id').eq('schedule_type', 'onsite_exam');
  query = campaign.campaign_group_id ? query.eq('campaign_group_id', campaign.campaign_group_id) : query.eq('id', campaign.id);
  const { data: days, error: daysError } = await query;
  if (daysError) throw new Error(daysError.message);
  const { data: links, error: linkError } = await supabase.from('roster_setup_links').select('setup_id').in('onsite_id', (days ?? []).map((day) => day.id));
  if (linkError) throw new Error(linkError.message);
  const ids = [...new Set((links ?? []).map((link) => link.setup_id))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from('roster_schedules').select('*').in('id', ids).order('schedule_date');
  if (error) throw new Error(error.message || 'Không tải được lịch set-up.');
  return (data ?? []) as RosterSchedule[];
}
