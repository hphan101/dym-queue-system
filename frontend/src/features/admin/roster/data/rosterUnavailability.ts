import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { readRosterPages } from './rosterService';

export interface RosterUnavailability {
  id: string;
  personnel_id: string;
  unavailable_date: string;
  start_minute: number;
  end_minute: number;
}

export const rosterUnavailabilityKey = ['roster-unavailability'] as const;

export function useRosterUnavailability(date: string | string[], enabled = true, personnelId?: string) {
  const dates = typeof date === 'string' ? (date ? [date] : []) : date;
  return useQuery({
    queryKey: [...rosterUnavailabilityKey, dates, personnelId],
    enabled: enabled && dates.length > 0,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) => readRosterPages<RosterUnavailability>((start, end) => {
      const query = supabase.from('roster_unavailability')
        .select('id, personnel_id, unavailable_date, start_minute, end_minute')
        .order('unavailable_date').order('start_minute').order('id').range(start, end)
        .abortSignal(signal);
      if (dates.length === 1) query.eq('unavailable_date', dates[0]);
      else query.in('unavailable_date', dates);
      return personnelId ? query.eq('personnel_id', personnelId) : query;
    }),
  });
}

export async function saveRosterUnavailability(
  block: Omit<RosterUnavailability, 'id' | 'unavailable_date'>,
  dates: string[],
  id?: string,
) {
  const table = supabase.from('roster_unavailability');
  const rows = dates.map((unavailable_date) => ({ ...block, unavailable_date }));
  const { data, error } = await (id ? table.update(rows[0]).eq('id', id) : table.insert(rows)).select('id');
  if (error?.code === '23505') {
    throw new Error(dates.length > 1
      ? 'Có ngày đã được khai báo nghỉ. Vui lòng bỏ ngày đó rồi thử lại.'
      : 'Khung giờ này đã được khai báo.');
  }
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Không lưu được lịch bận.');
}

export async function deleteRosterUnavailability(id: string) {
  const { data, error } = await supabase.from('roster_unavailability').delete().eq('id', id).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Không xóa được lịch bận.');
}
