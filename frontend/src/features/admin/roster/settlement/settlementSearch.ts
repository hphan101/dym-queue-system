import { normalizeSearch } from '../../shared/adminFormatters';
import type { MedicalPersonnel } from '../data/rosterService';

export function normalizeSettlementSearch(value: string) {
  return normalizeSearch(value).replace(/đ/g, 'd');
}

export function personnelSearchFields(person: MedicalPersonnel) {
  return [person.personnel_code, person.full_name, person.phone_number, person.email];
}

export function settlementMatches(fields: (string | null | undefined)[], keyword: string): string[] | null {
  if (!keyword) return null;
  const normalized = fields.map((field) => normalizeSettlementSearch(field ?? ''));
  const matches = normalized.map((field) => field.includes(keyword) ? keyword : '');
  if (matches.some(Boolean)) return matches;

  // A query can also start in one column and finish in the next.
  const start = normalized.join(' ').indexOf(keyword);
  if (start < 0) return null;
  let offset = 0;
  return normalized.map((field) => {
    const match = field.slice(Math.max(0, start - offset), Math.max(0, start + keyword.length - offset));
    offset += field.length + 1;
    return match.trim();
  });
}
