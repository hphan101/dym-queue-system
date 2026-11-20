import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import type { BranchCode } from '../../../types/domain';
import { getInitialStaffName, rememberStaffName } from './adminIdentity';
import type { StaffRole } from '../accounts/types';

type BranchIds = Partial<Record<BranchCode, string>>;

export interface StaffIdentity {
  staffName: string;
  staffRole: StaffRole;
  branchIds: BranchIds;
  isLoadingIdentity: boolean;
  identityError: string | null;
}

export async function fetchStaffBranches(userId: string) {
  const [{ data: branches, error: branchError }, { data: access, error: accessError }] =
    await Promise.all([
      supabase.from('branches').select('id, code').eq('is_active', true),
      supabase.from('staff_branch_access').select('branch_id').eq('user_id', userId),
    ]);
  if (branchError || accessError || !branches) throw new Error('Không thể tải danh sách chi nhánh.');

  const assignedIds = new Set((access ?? []).map((entry) => String(entry.branch_id)));
  const all: BranchIds = {};
  const assigned: BranchIds = {};
  for (const branch of branches) {
    const code = String(branch.code);
    if (code !== 'q1' && code !== 'q7' && code !== 'hn') continue;
    const id = String(branch.id);
    all[code] = id;
    if (assignedIds.has(id)) assigned[code] = id;
  }
  return { all, assigned };
}

export function useStaffIdentity() {
  const [staffName, setStaffName] = useState<string>(getInitialStaffName);
  const [staffRole, setStaffRole] = useState<StaffRole>('receptionist');
  const [branchIds, setBranchIds] = useState<BranchIds>({});
  const [isLoadingIdentity, setIsLoadingIdentity] = useState(true);
  const [identityError, setIdentityError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadIdentityAndBranches = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !isMounted) return;

        const [{ data: profile }, branches] = await Promise.all([
          supabase
            .from('profiles')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle(),
          fetchStaffBranches(user.id),
        ]);

        if (!isMounted) return;

        if (
          profile?.role === 'admin' ||
          profile?.role === 'operator' ||
          profile?.role === 'receptionist'
        ) {
          setStaffRole(profile.role);
        }

        if (profile?.display_name) {
          const nextStaffName = String(profile.display_name);
          rememberStaffName(nextStaffName);
          setStaffName(nextStaffName);
        }

        setBranchIds(profile?.role === 'admin' && profile.permissions == null ? branches.all : branches.assigned);
      } catch {
        if (isMounted) {
          setIdentityError('Không thể xác thực người dùng hoặc tải danh sách chi nhánh.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingIdentity(false);
        }
      }
    };

    void loadIdentityAndBranches();
    return () => {
      isMounted = false;
    };
  }, []);

  return {
    staffName,
    setStaffName,
    staffRole,
    branchIds,
    isLoadingIdentity,
    identityError,
  };
}
