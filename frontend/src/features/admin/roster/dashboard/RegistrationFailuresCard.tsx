import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabaseClient';
import type { BranchCode } from '@/types/domain';
import { formatDisplayDate } from '../../shared/adminFormatters';

const reasons = [
  ['qr_expired', 'Mã QR đã hết hạn'],
  ['session_expired', 'Phiên điền hồ sơ đã hết hạn'],
  ['duplicate_document', 'Trùng CCCD hoặc hộ chiếu'],
  ['invalid_data', 'Dữ liệu chưa hợp lệ'],
  ['server_error', 'Lỗi hệ thống'],
] as const;

type FailureCount = { kind: typeof reasons[number][0]; total: number };
const formatCount = (count: number) => count.toLocaleString('vi-VN');

export function RegistrationFailuresCard({ date, branch, isActiveTab, refresh }: {
  date: string; branch: 'all' | BranchCode; isActiveTab: boolean; refresh: number;
}) {
  const query = useQuery({
    queryKey: ['registration-failures', branch, date],
    enabled: isActiveTab,
    staleTime: 60_000,
    refetchInterval: isActiveTab ? 60_000 : false,
    retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('get_registration_failures', {
        p_queue_date: date, p_branch_code: branch === 'all' ? null : branch,
      }).abortSignal(signal);
      if (error) throw error;
      return data as FailureCount[];
    },
  });
  const { refetch } = query;
  useEffect(() => {
    if (refresh > 0 && isActiveTab) void refetch();
  }, [refresh, isActiveTab, refetch]);

  const counts = new Map(query.data?.map(({ kind, total }) => [kind, Number(total)]));
  const total = reasons.reduce((sum, [reason]) => sum + (counts.get(reason) ?? 0), 0);

  return (
    <Card className="roster-dashboard-panel">
      <CardHeader>
        <CardTitle className="roster-dashboard-section-title">Lỗi đăng ký</CardTitle>
        <CardDescription>Ngày {formatDisplayDate(date)} · Lỗi ghi nhận trên máy chủ</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-32" aria-label="Đang tải thống kê lỗi đăng ký" />
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertDescription>Chưa tải được thống kê lỗi đăng ký. Vui lòng làm mới để thử lại.</AlertDescription>
          </Alert>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa ghi nhận lỗi đăng ký trong ngày.</p>
        ) : (
          <dl className="divide-y divide-border text-sm">
            {reasons.map(([reason, label]) => (
              <div key={reason} className="flex items-center justify-between gap-4 py-2">
                <dt>{label}</dt>
                <dd className="tabular-nums">{formatCount(counts.get(reason) ?? 0)}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 pt-2 font-semibold">
              <dt>Tổng lượt lỗi</dt>
              <dd className="tabular-nums">{formatCount(total)}</dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
