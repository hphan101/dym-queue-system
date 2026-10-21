import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabaseClient';
import { formatQueueNumber } from '../../../lib/queueNumber';
import type { BranchCode } from '../../../types/domain';
import type { RegistrationRow } from '../components/QueueTable';
import { rememberRegistrationCount } from '../registrationCountCache';
import { formatBirthDate } from '../utils/adminFormatters';

interface RegistrationRecord {
  id: string;
  queue_date: string;
  queue_number: number;
  full_name: string;
  birth_date: string;
  gender: string;
  phone_number: string;
  company_name: string | null;
  registered_at: string;
  first_called_at: string | null;
}

interface DisplayStateRecord {
  registration_id: string | null;
  queue_date: string | null;
  queue_number: number | null;
  called_at: string | null;
}

const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatRegistrationTime(value: string) {
  return timeFormatter.format(new Date(value));
}

export interface DashboardQueueData {
  rows: RegistrationRow[];
  displayData: DisplayStateRecord | null;
  activeQueue: string;
  activePatient: string;
  announcement: string;
}

export function useDashboardQueueQuery({
  branch,
  branchId,
  date,
}: {
  branch: BranchCode;
  branchId: string | undefined;
  date: string;
}) {
  return useQuery<DashboardQueueData, Error>({
    queryKey: ['dashboardQueue', branch, date],
    enabled: Boolean(branchId),
    queryFn: async () => {
      if (!branchId) {
        throw new Error('BRANCH_UNAVAILABLE');
      }

      const [registrationsResult, displayResult] = await Promise.all([
        supabase.rpc('get_dashboard_registrations', {
          p_branch_code: branch,
          p_queue_date: date,
        }),
        supabase
          .from('branch_display_state')
          .select('registration_id, queue_date, queue_number, called_at')
          .eq('branch_id', branchId)
          .maybeSingle(),
      ]);

      if (registrationsResult.error) {
        console.error('Lỗi khi tải registrations:', registrationsResult.error);
        throw new Error(registrationsResult.error.message);
      }
      if (displayResult.error) {
        console.error('Lỗi khi tải display state:', displayResult.error);
        throw new Error(displayResult.error.message);
      }

      const fetchedRows = (
        (registrationsResult.data as RegistrationRecord[] | null) ?? []
      ).map(
        (record): RegistrationRow => ({
          id: record.id,
          queueNumber: formatQueueNumber(record.queue_number),
          registeredAt: formatRegistrationTime(record.registered_at),
          date: record.queue_date,
          fullName: record.full_name,
          birthDate: formatBirthDate(record.birth_date),
          gender: record.gender,
          phone: record.phone_number,
          companyName: record.company_name?.trim() || '—',
          branch,
          status: record.first_called_at ? 'called' : 'waiting',
        }),
      );

      rememberRegistrationCount(branch, date, fetchedRows.length);

      const displayData = displayResult.data as DisplayStateRecord | null;
      let activeQueue = '—';
      let activePatient = 'Chưa gọi số';
      let announcement = 'Chưa có số đang được gọi tại chi nhánh này.';

      if (
        displayData?.queue_number &&
        displayData.queue_date === date &&
        displayData.registration_id
      ) {
        activeQueue = formatQueueNumber(displayData.queue_number);
        const patient = fetchedRows.find(
          (row) => row.id === displayData.registration_id,
        );
        activePatient = patient?.fullName ?? 'Khách đang được gọi';
        announcement = `Đang gọi số ${activeQueue}${patient ? ` — ${patient.fullName}` : ''}.`;
      }

      return {
        rows: fetchedRows,
        displayData,
        activeQueue,
        activePatient,
        announcement,
      };
    },
  });
}

