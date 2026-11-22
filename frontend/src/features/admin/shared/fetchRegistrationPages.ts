import { supabase } from '../../../lib/supabaseClient';
import type { BranchCode } from '../../../types/domain';

const PAGE_SIZE = 1000;

export async function fetchRegistrationPages<Row>(
  rpc: 'get_registration_details' | 'get_dashboard_registrations',
  branch: BranchCode,
  date: string,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc(rpc, { p_branch_code: branch, p_queue_date: date })
      .order('queue_number')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
