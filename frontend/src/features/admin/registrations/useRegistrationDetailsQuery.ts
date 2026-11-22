import { useQuery } from '@tanstack/react-query';
import type { BranchCode } from '../../../types/domain';
import { fetchRegistrationPages } from '../shared/fetchRegistrationPages';
import type { RegistrationDetails } from './types';
import { syncPrintStatusesFromServer } from './usePrintStatus';

export type { RegistrationDetails } from './types';

export function fetchRegistrationDay(branch: BranchCode, date: string) {
  return fetchRegistrationPages<RegistrationDetails>('get_registration_details', branch, date);
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

      const rows = await fetchRegistrationDay(branch, date);
      syncPrintStatusesFromServer(rows);
      return rows;
    },
  });
}

