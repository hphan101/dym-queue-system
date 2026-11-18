import { getCountedProvisionalCost, summarizeAssignmentCosts, type RosterAssignment, type RosterSchedule } from '../data/rosterService';

export type CampaignCostType = 'all' | 'blood_draw' | 'onsite_exam' | 'setup';

export function buildCampaignSettlementRows(schedules: RosterSchedule[], assignments: RosterAssignment[], month: string, today: string) {
  const bySchedule = new Map<string, RosterAssignment[]>();
  for (const assignment of assignments) {
    const list = bySchedule.get(assignment.schedule_id) ?? [];
    list.push(assignment);
    bySchedule.set(assignment.schedule_id, list);
  }
  return schedules
    .filter(schedule => schedule.schedule_type !== 'insite' && schedule.schedule_date.startsWith(`${month}-`))
    .map(schedule => {
      const entries = bySchedule.get(schedule.id) ?? [];
      return {
        schedule,
        entries,
        personnelCount: new Set(entries.map(entry => entry.personnel_id)).size,
        ...summarizeAssignmentCosts(entries),
        reserve: getCountedProvisionalCost(schedule, today),
      };
    })
    .sort((a, b) => a.schedule.schedule_date.localeCompare(b.schedule.schedule_date) || (a.schedule.campaign_code ?? '').localeCompare(b.schedule.campaign_code ?? '') || a.schedule.id.localeCompare(b.schedule.id));
}

export type CampaignSettlementRow = ReturnType<typeof buildCampaignSettlementRows>[number];
