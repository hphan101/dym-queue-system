import type { BranchCode } from '@/types/domain';
import type { MedicalPersonnel, PersonnelRoleType, RosterAssignment, RosterSchedule } from '../data/rosterService';
import { normalizeSettlementSearch, personnelSearchFields, settlementMatches } from './settlementSearch';

export type SettlementLocation = 'all' | 'insite' | 'onsite';
export type SettlementSort = 'name' | 'shiftCount' | 'totalGrand';
export interface SettlementEntry {
  assignment: RosterAssignment;
  schedule: RosterSchedule;
}
export interface SettlementRow {
  person: MedicalPersonnel;
  entries: SettlementEntry[];
  shiftCount: number;
  insiteCount: number;
  onsiteCount: number;
  totalBase: number;
  totalAllowance: number;
  totalGrand: number;
}
export interface SettlementFilters {
  month: string;
  role?: 'all' | PersonnelRoleType;
  query?: string;
  branch?: 'all' | BranchCode;
  location?: SettlementLocation;
  sortBy?: SettlementSort;
  sortDirection?: 'asc' | 'desc';
}

export function buildSettlementRows(
  schedules: RosterSchedule[],
  assignments: RosterAssignment[],
  personnel: MedicalPersonnel[],
  filters: SettlementFilters,
): SettlementRow[] {
  const schedulesById = new Map(schedules.filter(schedule =>
    schedule.schedule_date.startsWith(`${filters.month}-`) &&
    (!filters.branch || filters.branch === 'all' || schedule.branch_code === filters.branch) &&
    (!filters.location || filters.location === 'all' ||
      (filters.location === 'insite' ? schedule.schedule_type === 'insite' : schedule.schedule_type !== 'insite')),
  ).map(schedule => [schedule.id, schedule]));
  const query = normalizeSettlementSearch(filters.query ?? '');
  const people = new Map(personnel.filter(person =>
    (!filters.role || filters.role === 'all' || person.role_type === filters.role) &&
    (!query || settlementMatches(personnelSearchFields(person), query)),
  ).map(person => [person.id, person]));
  const rows = new Map<string, SettlementRow>();
  for (const assignment of assignments) {
    const schedule = schedulesById.get(assignment.schedule_id);
    const person = people.get(assignment.personnel_id);
    if (!schedule || !person) continue;
    const row = rows.get(person.id) ?? {
      person, entries: [], shiftCount: 0, insiteCount: 0, onsiteCount: 0,
      totalBase: 0, totalAllowance: 0, totalGrand: 0,
    };
    row.entries.push({ assignment, schedule });
    row.shiftCount++;
    if (schedule.schedule_type === 'insite') row.insiteCount++;
    else row.onsiteCount++;
    const base = Number(assignment.base_cost_snapshot ?? 0);
    const allowance = Number(assignment.allowance_cost ?? 0);
    row.totalBase += base;
    row.totalAllowance += allowance;
    row.totalGrand += base + allowance;
    rows.set(person.id, row);
  }
  for (const row of rows.values()) {
    row.entries.sort((a, b) => a.schedule.schedule_date.localeCompare(b.schedule.schedule_date) || a.assignment.id.localeCompare(b.assignment.id));
  }
  const sortBy = filters.sortBy ?? 'totalGrand';
  const direction = filters.sortDirection === 'asc' ? 1 : -1;
  return Array.from(rows.values()).sort((a, b) => {
    const comparison = sortBy === 'name'
      ? a.person.full_name.localeCompare(b.person.full_name, 'vi')
      : a[sortBy] - b[sortBy];
    return comparison * direction || a.person.personnel_code.localeCompare(b.person.personnel_code);
  });
}
