import {
  getCountedProvisionalCost,
  summarizeAssignmentCosts,
  type RosterAssignment,
  type RosterSchedule,
} from '../data/rosterService';

export function buildSettlementMetrics(
  schedules: RosterSchedule[],
  assignments: RosterAssignment[],
  month: string,
  today: string,
) {
  const [year, monthNumber] = month.split('-').map(Number);
  const days = Array.from({ length: new Date(Date.UTC(year, monthNumber, 0)).getUTCDate() }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    return { date, forecast: 0, actual: date < today ? 0 : null, reserve: 0, personnel: 0 };
  });
  const byDate = new Map(days.map(day => [day.date, day]));
  const monthSchedules = new Map(schedules.filter(schedule => byDate.has(schedule.schedule_date)).map(schedule => [schedule.id, schedule]));
  const peopleByDay = new Map<string, Set<string>>();
  const people = new Set<string>();

  for (const schedule of monthSchedules.values()) {
    const day = byDate.get(schedule.schedule_date)!;
    day.reserve += getCountedProvisionalCost(schedule, today);
  }
  for (const assignment of assignments) {
    const schedule = monthSchedules.get(assignment.schedule_id);
    if (!schedule) continue;
    const day = byDate.get(schedule.schedule_date)!;
    const cost = summarizeAssignmentCosts([assignment]).totalCost;
    day.forecast += cost;
    if (day.actual !== null) day.actual += cost;
    people.add(assignment.personnel_id);
    const dailyPeople = peopleByDay.get(day.date) ?? new Set<string>();
    dailyPeople.add(assignment.personnel_id);
    peopleByDay.set(day.date, dailyPeople);
  }
  for (const day of days) {
    day.forecast += day.reserve;
    day.personnel = peopleByDay.get(day.date)?.size ?? 0;
  }
  return {
    days,
    totals: {
      forecast: days.reduce((sum, day) => sum + day.forecast, 0),
      actual: days.reduce((sum, day) => sum + (day.actual ?? 0), 0),
      reserve: days.reduce((sum, day) => sum + day.reserve, 0),
      personnel: people.size,
    },
  };
}

export type SettlementMetrics = ReturnType<typeof buildSettlementMetrics>;
