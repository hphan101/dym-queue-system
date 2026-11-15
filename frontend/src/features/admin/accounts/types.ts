import type { BranchCode } from '@/types/domain';
import type { StaffPermissions } from '@/lib/staffPermissions';

export type StaffRole = 'admin' | 'operator' | 'receptionist';

export type StaffStatusTab = 'all' | 'active' | 'locked';

export interface StaffBranch {
  code: BranchCode;
  name: string;
}

export interface StaffAccount {
  permissions?: StaffPermissions | null;
  canEditRosterHistory: boolean;
  userId: string;
  loginName: string;
  displayName: string;
  role: StaffRole;
  isActive: boolean;
  branches: StaffBranch[];
  createdAt: string;
  lastSignInAt: string | null;
}

export interface StaffFormState {
  permissions: StaffPermissions;
  canEditRosterHistory: boolean;
  userId: string | null;
  displayName: string;
  loginName: string;
  password: string;
  role: StaffRole | '';
  branchCodes: BranchCode[];
}
