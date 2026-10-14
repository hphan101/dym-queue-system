import type { BranchCode } from '../types/domain';

export const BRANCH_NAMES: Record<BranchCode, string> = {
  q1: 'DYM mPlaza Quận 1',
  q7: 'DYM The Grace Quận 7',
  hn: 'DYM Epic Tower Cầu Giấy',
};

export function isBranchCode(value: string | undefined): value is BranchCode {
  return value === 'q1' || value === 'q7' || value === 'hn';
}
