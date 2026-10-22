import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabaseClient';
import type { BranchCode } from '../../../types/domain';
import { rememberRegistrationCount } from '../registrationCountCache';
import type { RegistrationDetails } from '../types';
import { syncPrintStatusesFromServer } from './usePrintStatus';

export type { RegistrationDetails } from '../types';

export function useRegistrationDetailsQuery({
  branch,
  branchId,
  date,
}: {
  branch: BranchCode;
  branchId: string | undefined;
  date: string;
}) {
  return useQuery<RegistrationDetails[], Error>({
    queryKey: ['registrationDetails', branch, date],
    enabled: Boolean(branchId),
    queryFn: async () => {
      if (!branchId) {
        throw new Error('BRANCH_UNAVAILABLE');
      }

      const { data, error: queryError } = await supabase.rpc(
        'get_registration_details',
        {
          p_branch_code: branch,
          p_queue_date: date,
        },
      );

      if (queryError) {
        console.error('Không thể tải chi tiết đăng ký:', queryError);
        throw new Error(queryError.message);
      }

      const rows = (data ?? []) as RegistrationDetails[];
      rememberRegistrationCount(branch, date, rows.length);
      syncPrintStatusesFromServer(rows);
      return rows;
    },
  });
}

