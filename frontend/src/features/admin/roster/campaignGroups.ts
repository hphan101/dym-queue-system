import type { OnsiteScheduleInput, RosterSchedule } from './rosterService';

const GROUPS: Array<{ type: OnsiteScheduleInput['schedule_type']; label: string }> = [
  { type: 'blood_draw', label: 'Blood sampling' },
  { type: 'onsite_exam', label: 'Onsite HC' },
  { type: 'setup', label: 'Onsite set-up' },
];

export function groupCampaignsByCategory(campaigns: RosterSchedule[]) {
  return [
    { type: 'blood_draw', label: 'Blood sampling', items: campaigns.filter((item) => item.schedule_type === 'blood_draw') },
    { type: 'onsite', label: 'Onsite', items: campaigns.filter((item) => item.schedule_type === 'onsite_exam' || item.schedule_type === 'setup') },
  ];
}

export function groupCampaignsByDate(campaigns: RosterSchedule[]) {
  const byDate = new Map<string, RosterSchedule[]>();
  for (const campaign of campaigns) {
    if (campaign.schedule_type === 'insite') continue;
    const items = byDate.get(campaign.schedule_date) ?? [];
    items.push(campaign);
    byDate.set(campaign.schedule_date, items);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({
    date,
    total: items.length,
    groups: GROUPS.map((group) => ({ ...group, items: items.filter((item) => item.schedule_type === group.type) })),
  }));
}
