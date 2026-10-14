import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import type { BranchCode } from '../../../types/domain';
import { getInitialStaffName, rememberStaffName } from '../adminIdentity';

export function useStaffIdentity() {
  const [staffName, setStaffName] = useState<string>(getInitialStaffName);
  const [branchIds, setBranchIds] = useState<Partial<Record<BranchCode, string>>>({});
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

        const [
          { data: profile },
          { data: branchRecords, error: branchError },
          { data: accessRecords, error: accessError },
        ] = await Promise.all([
          supabase
            .from('profiles')
            .select('display_name, role')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase.from('branches').select('id, code').eq('is_active', true),
          supabase
            .from('staff_branch_access')
            .select('branch_id')
            .eq('user_id', user.id),
        ]);

        if (!isMounted) return;

        if (branchError || accessError || !branchRecords) {
          setIdentityError('Không thể tải danh sách chi nhánh.');
          setIsLoadingIdentity(false);
          return;
        }

        const nextBranchIds: Partial<Record<BranchCode, string>> = {};
        const allowedBranchIds = new Set(
          (accessRecords ?? []).map((access) => String(access.branch_id)),
        );

        for (const record of branchRecords) {
          const code = String(record.code);
          if (
            (code === 'q1' || code === 'q7' || code === 'hn') &&
            (profile?.role === 'admin' || allowedBranchIds.has(String(record.id)))
          ) {
            nextBranchIds[code] = String(record.id);
          }
        }

        if (profile?.display_name) {
          const nextStaffName = String(profile.display_name);
          rememberStaffName(nextStaffName);
          setStaffName(nextStaffName);
        }

        setBranchIds(nextBranchIds);
      } catch {
        if (isMounted) {
          setIdentityError('Lỗi xác thực người dùng.');
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
    branchIds,
    isLoadingIdentity,
    identityError,
  };
}
