import type { BranchCode } from '../../types/domain';

const countsByBranchAndDate = new Map<string, number>();

function getCacheKey(branch: BranchCode, date: string) {
  return `${branch}:${date}`;
}

export function getCachedRegistrationCount(branch: BranchCode, date: string) {
  return countsByBranchAndDate.get(getCacheKey(branch, date));
}

export function rememberRegistrationCount(
  branch: BranchCode,
  date: string,
  count: number,
) {
  countsByBranchAndDate.set(getCacheKey(branch, date), count);
}
