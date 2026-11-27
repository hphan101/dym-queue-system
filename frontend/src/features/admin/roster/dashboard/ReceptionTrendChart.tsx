import { useEffect, useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabaseClient';
import type { BranchCode } from '@/types/domain';
import { buildReceptionTrend, type ReceptionDailyCount, type ReceptionTrendPeriod } from './receptionTrend';
import './receptionTrend.css';

const chartConfig = {
  count: { label: 'Lượt tiếp nhận', theme: { light: '#202e61', dark: '#92a7e2' } },
} satisfies ChartConfig;
const formatCount = (value: number) => value.toLocaleString('vi-VN');

export function ReceptionTrendChart({ date, today, branch, isActiveTab, refresh }: {
  date: string; today: string; branch: 'all' | BranchCode; isActiveTab: boolean; refresh: number;
}) {
  const [period, setPeriod] = useState<ReceptionTrendPeriod>('daily');
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const gradientId = `reception-fill-${useId().replace(/:/g, '')}`;
  const titleId = useId();
  const year = Number(date.slice(0, 4));
  const query = useQuery({
    queryKey: ['reception-trend', year, branch],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('get_reception_trend', {
        p_year: year, p_branch_code: branch === 'all' ? null : branch,
      }).abortSignal(signal);
      if (error) throw new Error('Không tải được số liệu tiếp nhận. Vui lòng thử lại.');
      return data as ReceptionDailyCount[];
    },
    enabled: isActiveTab,
    staleTime: 60_000,
    refetchInterval: isActiveTab ? 60_000 : false,
    retry: 1,
  });
  const { refetch } = query;
  useEffect(() => {
    if (refresh > 0 && isActiveTab) void refetch();
  }, [refresh, isActiveTab, refetch]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const points = useMemo(() => buildReceptionTrend(query.data ?? [], date, period, today), [query.data, date, period, today]);
  const total = points.reduce((sum, point) => sum + point.count, 0);
  const periodLabel = period === 'daily' ? `Tháng ${Number(date.slice(5, 7))}/${year}` : `Năm ${year}`;

  return <Card className="reception-trend roster-dashboard-panel" aria-labelledby={titleId}>
    <CardHeader>
      <div className="reception-trend-header">
        <div className="flex flex-col gap-2">
          <CardTitle id={titleId} className="roster-dashboard-section-title">Lượt tiếp nhận</CardTitle>
          <CardDescription>{periodLabel} · Không tính hồ sơ đã hủy</CardDescription>
        </div>
        <Tabs value={period} onValueChange={(value) => setPeriod(value as ReceptionTrendPeriod)} activationMode="manual">
          <TabsList aria-label="Thống kê lượt tiếp nhận">
            <TabsTrigger value="daily">Theo ngày</TabsTrigger>
            <TabsTrigger value="monthly">Theo tháng</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </CardHeader>
    <CardContent>
      {query.isPending ? <Skeleton className="h-80 w-full" aria-label="Đang tải số liệu tiếp nhận" /> : query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Chưa tải được lượt tiếp nhận</AlertTitle>
          <AlertDescription>{query.error.message}</AlertDescription>
          <Button type="button" variant="outline" className="mt-4" onClick={() => void refetch()}>Thử lại</Button>
        </Alert>
      ) : <>
        <p className="reception-trend-total" aria-live="polite">{formatCount(total)} <span>lượt tiếp nhận</span></p>
        {!total && <p className="reception-trend-empty" role="status">Chưa có lượt tiếp nhận trong kỳ này</p>}
        <ChartContainer config={chartConfig} className="reception-trend-plot" aria-label={`Lượt tiếp nhận ${periodLabel.toLowerCase()}`}>
          <AreaChart accessibilityLayer data={points} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
            <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.26} />
              <stop offset="100%" stopColor="var(--color-count)" stopOpacity={0.02} />
            </linearGradient></defs>
            <CartesianGrid vertical={false} strokeDasharray="3 4" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={12} minTickGap={24} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tickMargin={12} width={48} domain={[0, (max: number) => Math.max(4, max)]} tickFormatter={formatCount} />
            <ChartTooltip animationDuration={reduceMotion ? 0 : 120} content={<ChartTooltipContent
              labelFormatter={(_, payload) => payload[0]?.payload.fullLabel}
              formatter={(value) => <div className="flex flex-1 items-center justify-between gap-4"><span>Tiếp nhận</span><span className="tabular-nums">{formatCount(Number(value))} lượt</span></div>}
            />} />
            <Area type="monotone" dataKey="count" stroke="var(--color-count)" strokeWidth={2} fill={`url(#${gradientId})`} dot={points.length === 1 ? { r: 3 } : false} activeDot={{ r: 4, strokeWidth: 2 }}
              isAnimationActive={!reduceMotion} animationBegin={0} animationDuration={1000} animationEasing="ease-in-out" />
          </AreaChart>
        </ChartContainer>
        <details className="reception-trend-data">
          <summary>Xem bảng số liệu</summary>
          <div className="roster-dashboard-table-scroll"><table className="roster-dashboard-table">
            <caption className="sr-only">Lượt tiếp nhận {periodLabel.toLowerCase()}</caption>
            <thead><tr><th scope="col">{period === 'daily' ? 'Ngày' : 'Tháng'}</th><th scope="col">Lượt tiếp nhận</th></tr></thead>
            <tbody>{points.map((point) => <tr key={point.date}><th scope="row">{point.fullLabel}</th><td>{formatCount(point.count)}</td></tr>)}</tbody>
          </table></div>
        </details>
      </>}
    </CardContent>
  </Card>;
}
