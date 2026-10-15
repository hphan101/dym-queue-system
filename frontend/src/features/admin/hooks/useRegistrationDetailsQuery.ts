import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabaseClient';
import type { BranchCode } from '../../../types/domain';
import { rememberRegistrationCount } from '../registrationCountCache';

export interface RegistrationDetails {
  id: string;
  branch_id: string;
  queue_date: string;
  queue_number: number;
  registered_at: string;
  full_name: string;
  birth_date: string;
  gender: string;
  phone_number: string;
  identity_document: string;
  company_name: string;
  province: string;
  ward: string;
  address_detail: string;
  state: 'active' | 'completed' | 'cancelled';
  first_called_at: string | null;
  last_called_at: string | null;
}

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
      return rows;
    },
  });
}

