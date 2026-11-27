import { useQuery } from '@tanstack/react-query';
import { BRANCH_NAMES } from '../../../config/branches';
import { getTodayInVietnam } from '../../../lib/date';
import { formatQueueNumber } from '../../../lib/queueNumber';
import { supabase } from '../../../lib/supabaseClient';
import type { SupportedLanguage } from '../../../locales';
import type { RegistrationReceipt } from './registrationReceipt';

const copy = {
  vi: { label: 'Số đang gọi', loading: 'Đang tải số đang gọi…', unavailable: 'Chưa kết nối được. Vui lòng xem màn hình tại quầy.', empty: 'Chưa có số đang gọi', yours: 'Đang gọi số của bạn. Vui lòng đến quầy tiếp nhận.' },
  en: { label: 'Now calling', loading: 'Loading the current number…', unavailable: 'Unable to connect. Please check the screen at reception.', empty: 'No number is being called', yours: 'Your number is being called. Please go to reception.' },
  ja: { label: '呼び出し中の番号', loading: '呼び出し番号を確認しています…', unavailable: '接続できません。受付の画面をご確認ください。', empty: '現在、呼び出し中の番号はありません', yours: 'お客様の番号をお呼びしています。受付までお越しください。' },
} satisfies Record<SupportedLanguage, { label: string; loading: string; unavailable: string; empty: string; yours: string }>;

export function CurrentQueueStatus({ receipt, lang }: { receipt: RegistrationReceipt; lang: SupportedLanguage }) {
  const { branch, queueDate, queueNumber } = receipt;
  const t = copy[lang];
  const today = getTodayInVietnam();
  const branchQuery = useQuery({
    queryKey: ['public-queue-branch', branch],
    enabled: queueDate === today,
    staleTime: 15 * 60_000,
    refetchInterval: (query) => query.state.status === 'error' ? 15_000 : false,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('branches').select('id').eq('code', branch).eq('is_active', true).abortSignal(signal).maybeSingle();
      if (error || !data) throw new Error('Unable to load queue branch');
      return data.id;
    },
  });
  const current = useQuery({
    queryKey: ['public-current-queue', branchQuery.data, queueDate],
    enabled: !!branchQuery.data && queueDate === today,
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('branch_display_state')
        .select('queue_date, queue_number').eq('branch_id', branchQuery.data!).abortSignal(signal).maybeSingle();
      if (error) throw error;
      return data?.queue_date === queueDate && data.queue_number != null ? formatQueueNumber(data.queue_number) : null;
    },
  });

  if (queueDate !== today) return null;
  const hasError = branchQuery.isError || current.isError;
  const activeNumber = hasError ? null : current.data;
  const isYourNumber = activeNumber === queueNumber;
  return (
    <section aria-label={t.label} className="mx-auto max-w-sm rounded-xl border border-dym-blue-100 bg-white px-4 py-3 text-slate-700">
      <div className="flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-dym-blue-800">{t.label}</h2>
          <p className="text-xs text-slate-600">{BRANCH_NAMES[branch]}</p>
        </div>
        <strong className="text-2xl tabular-nums text-dym-blue-800" aria-live="polite">{activeNumber ?? '—'}</strong>
      </div>
      {(hasError || !activeNumber || isYourNumber) && (
        <p className="mt-2 text-left text-sm" role="status">
          {hasError ? t.unavailable : isYourNumber ? t.yours : current.isPending ? t.loading : t.empty}
        </p>
      )}
    </section>
  );
}
