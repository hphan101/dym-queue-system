import { buildInsiteWeek, getInsiteWeekDates } from '../clinic/insiteWeek';
import {
  getCountedProvisionalCost,
  shiftIsoDate,
  summarizeAssignmentCosts,
  type ClinicRoom,
  type DailyRoomOverride,
  type RosterAssignment,
  type RosterSchedule,
} from '../data/rosterService';

export type DashboardBranch = 'all' | 'q1' | 'q7';
export interface DashboardBundle {
  schedules: RosterSchedule[];
  assignments: RosterAssignment[];
  dailyRoomOverrides: DailyRoomOverride[];
}

export function getWeeklyChartScale(peak: number) {
  const target = Math.max(1, peak / 4);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step =
    [1, 2, 5, 10].find((value) => value * magnitude >= target)! * magnitude;
  const maximum = Math.max(4, Math.ceil(peak / step) * step);
  return {
    maximum,
    ticks: Array.from(
      { length: maximum / step + 1 },
      (_, index) => index * step,
    ).reverse(),
  };
}

export function dashboardHref(
  page: 'roster-onsite' | 'roster-insite' | 'roster-settlement',
  date: string,
  branch: string,
  campaign?: string,
  type?: string,
) {
  const params = new URLSearchParams({ page, branch, date });
  if (campaign) params.set('campaign', campaign);
  if (type) params.set('type', type);
  if (page === 'roster-insite') params.set('view', 'day');
  return `/?${params}`;
}

export function buildDashboardSummary(
  bundle: DashboardBundle,
  rooms: ClinicRoom[],
  date: string,
  branch: DashboardBranch,
  today: string,
) {
  const month = date.slice(0, 7);
  const end = shiftIsoDate(date, 6);
  const scope = bundle.schedules.filter(
    (item) => branch === 'all' || item.branch_code === branch,
  );
  const scopedIds = new Set(scope.map((item) => item.id));
  const assignments = bundle.assignments.filter((item) =>
    scopedIds.has(item.schedule_id),
  );
  const assignedBySchedule = new Map<string, RosterAssignment[]>();
  for (const assignment of assignments) {
    const list = assignedBySchedule.get(assignment.schedule_id) ?? [];
    list.push(assignment);
    assignedBySchedule.set(assignment.schedule_id, list);
  }
  const campaigns = scope.filter((item) => item.schedule_type !== 'insite');
  const campaignRows = campaigns.map((schedule) => {
    const assigned = new Set(
      (assignedBySchedule.get(schedule.id) ?? []).map(
        (item) => item.position_label,
      ),
    );
    const positions = [...new Set(schedule.position_list)];
    const missing = positions.filter((name) => !assigned.has(name));
    return {
      schedule,
      required: positions.length,
      filled: positions.length - missing.length,
      missing,
    };
  });
  const upcoming = campaignRows
    .filter(
      (item) =>
        item.schedule.schedule_date >= date &&
        item.schedule.schedule_date <= end,
    )
    .sort(
      (a, b) =>
        a.schedule.schedule_date.localeCompare(b.schedule.schedule_date) ||
        a.schedule.company_name.localeCompare(b.schedule.company_name, 'vi'),
    );
  const dailyCampaigns = upcoming.filter(
    (item) => item.schedule.schedule_date === date,
  );
  const branches = branch === 'all' ? ['q1', 'q7'] : [branch];
  const clinics = branches.map((code) => {
    const rows = buildInsiteWeek(
      [date],
      code,
      rooms,
      bundle.dailyRoomOverrides,
      scope,
      assignments,
    );
    const filled = rows.filter(
      (row) => (row.days.get(date)?.length ?? 0) > 0,
    ).length;
    return {
      branch: code,
      total: rows.length,
      filled,
      missing: rows.length - filled,
    };
  });
  const dailySchedules = scope.filter((item) => item.schedule_date === date);
  const dailyIds = new Set(dailySchedules.map((item) => item.id));
  const dailyAssignments = assignments.filter((item) =>
    dailyIds.has(item.schedule_id),
  );
  const byPerson = new Map<string, RosterAssignment[]>();
  const visiblePeople = new Set(
    dailyAssignments.map((item) => item.personnel_id),
  );
  const allDailySchedules = bundle.schedules.filter(
    (item) => item.schedule_date === date,
  );
  const allDailyIds = new Set(allDailySchedules.map((item) => item.id));
  for (const assignment of bundle.assignments.filter(
    (item) =>
      allDailyIds.has(item.schedule_id) && visiblePeople.has(item.personnel_id),
  )) {
    const list = byPerson.get(assignment.personnel_id) ?? [];
    list.push(assignment);
    byPerson.set(assignment.personnel_id, list);
  }
  const conflicts = [...byPerson.entries()].flatMap(([personnelId, list]) => {
    const overlapping = list.filter((item, index) =>
      list.some(
        (other, otherIndex) =>
          index !== otherIndex &&
          (item.shift_period === 'FULL' ||
            other.shift_period === 'FULL' ||
            item.shift_period === other.shift_period),
      ),
    );
    return overlapping.length
      ? [
          {
            personnelId,
            schedules: allDailySchedules.filter((schedule) =>
              overlapping.some((item) => item.schedule_id === schedule.id),
            ),
          },
        ]
      : [];
  });
  const monthSchedules = scope.filter((item) =>
    item.schedule_date.startsWith(month),
  );
  const monthIds = new Set(monthSchedules.map((item) => item.id));
  const monthAssignments = assignments.filter((item) =>
    monthIds.has(item.schedule_id),
  );
  const reserve = monthSchedules.reduce(
    (sum, item) => sum + getCountedProvisionalCost(item, today),
    0,
  );
  const actualIds = new Set(
    monthSchedules
      .filter((item) => item.schedule_date < today)
      .map((item) => item.id),
  );
  const monthlyCampaigns = campaigns.filter((item) =>
    item.schedule_date.startsWith(month),
  );
  const weeklyMap = new Map<
    string,
    {
      start: string;
      end: string;
      blood_draw: number;
      onsite_exam: number;
      setup: number;
    }
  >();
  const lastDay = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  for (let day = `${month}-01`; day <= lastDay; day = shiftIsoDate(day, 1)) {
    const week = getInsiteWeekDates(day);
    if (!weeklyMap.has(week[0]))
      weeklyMap.set(week[0], {
        start: week[0] < `${month}-01` ? `${month}-01` : week[0],
        end: week[6] > lastDay ? lastDay : week[6],
        blood_draw: 0,
        onsite_exam: 0,
        setup: 0,
      });
  }
  for (const item of monthlyCampaigns) {
    if (item.schedule_type !== 'insite')
      weeklyMap.get(getInsiteWeekDates(item.schedule_date)[0])![
        item.schedule_type
      ] += 1;
  }
  return {
    clinics,
    upcoming,
    dailyCampaigns,
    conflicts,
    unlinked: upcoming.filter(
      (item) =>
        item.schedule.schedule_type === 'setup' &&
        !item.schedule.setup_onsite_ids?.length,
    ),
    unconfigured: upcoming.filter((item) => item.required === 0),
    staffed: clinics.reduce((sum, item) => sum + item.filled, 0),
    rooms: clinics.reduce((sum, item) => sum + item.total, 0),
    personnel: byPerson.size,
    missing:
      clinics.reduce((sum, item) => sum + item.missing, 0) +
      dailyCampaigns.reduce((sum, item) => sum + item.missing.length, 0),
    weeks: [...weeklyMap.values()],
    monthlyCampaignCount: monthlyCampaigns.length,
    reserve,
    forecast: summarizeAssignmentCosts(monthAssignments).totalCost + reserve,
    actual: summarizeAssignmentCosts(
      monthAssignments.filter((item) => actualIds.has(item.schedule_id)),
    ).totalCost,
  };
}
