import { useEffect, useId, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDisplayDate } from '../../shared/adminFormatters';
import { SCHEDULE_TYPE_LABELS } from '../data/rosterService';
import { getWeeklyChartScale, type buildDashboardSummary } from './dashboardSummary';

type Week = ReturnType<typeof buildDashboardSummary>['weeks'][number];
const types = ['blood_draw', 'onsite_exam', 'setup'] as const;
type CampaignType = typeof types[number];
const seriesConfig = {
  blood_draw: { label: SCHEDULE_TYPE_LABELS.blood_draw, theme: { light: '#ad3446', dark: '#e58a99' } },
  onsite_exam: { label: SCHEDULE_TYPE_LABELS.onsite_exam, theme: { light: '#2c5ea4', dark: '#82a6e1' } },
  setup: { label: SCHEDULE_TYPE_LABELS.setup, theme: { light: '#216f60', dark: '#72bea9' } },
} satisfies ChartConfig;
const totalFor = (week: Week) => week.blood_draw + week.onsite_exam + week.setup;
const dateRange = (week: Week) => `${formatDisplayDate(week.start).slice(0, 5)} - ${formatDisplayDate(week.end).slice(0, 5)}`;

export function WeeklyCampaignChart({ weeks, count, month }: { weeks: Week[]; count: number; month: string }) {
  const titleId = useId();
  const captionId = useId();
  const gradientId = `campaign-fill-${useId().replace(/:/g, '')}`;
  const [filter, setFilter] = useState<CampaignType | 'all'>('all');
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const data = useMemo(() => weeks.map((week, index) => ({ ...week, label: `Tuần ${index + 1}`, fullLabel: `Tuần ${index + 1} · ${dateRange(week)}` })), [weeks]);
  const visibleTypes = types.filter((type) => filter === 'all' || type === filter);
  const totals = Object.fromEntries(types.map((type) => [type, weeks.reduce((sum, week) => sum + week[type], 0)])) as Record<CampaignType, number>;
  const config: ChartConfig = Object.fromEntries(types.map((type) => [type, {
    ...seriesConfig[type],
    label: <span className="inline-flex items-center gap-2">{SCHEDULE_TYPE_LABELS[type]}<span className="tabular-nums">{totals[type]}</span></span>,
  }]));
  const { maximum, ticks } = getWeeklyChartScale(Math.max(0, ...weeks.map((week) => visibleTypes.reduce((sum, type) => sum + week[type], 0))));

  return <Card className="roster-dashboard-panel roster-week-panel">
    <CardHeader className="border-b">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <CardTitle className="roster-dashboard-section-title"><h3 id={titleId}>Số đoàn theo tuần</h3></CardTitle>
          <CardDescription>Tháng {month.slice(5)}/{month.slice(0, 4)} · {filter === 'all' ? count : totals[filter]} lượt thực hiện</CardDescription>
        </div>
        <Select value={filter} onValueChange={(value) => setFilter(value as CampaignType | 'all')}>
          <SelectTrigger className="w-48" aria-label="Loại đoàn trong biểu đồ"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="all">Tất cả loại đoàn</SelectItem>
            {types.map((type) => <SelectItem key={type} value={type}>{SCHEDULE_TYPE_LABELS[type]}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
      </div>
    </CardHeader>
    <CardContent>
      <figure aria-labelledby={titleId} aria-describedby={captionId}>
        <ChartContainer config={config} className="roster-week-area">
          <AreaChart accessibilityLayer data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <defs>{types.map((type) => <linearGradient key={type} id={`${gradientId}-${type}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${type})`} stopOpacity={0.5} />
              <stop offset="95%" stopColor={`var(--color-${type})`} stopOpacity={0.06} />
            </linearGradient>)}</defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} minTickGap={8} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={32} allowDecimals={false} domain={[0, maximum]} ticks={[...ticks].reverse()} />
            <ChartTooltip cursor={false} animationDuration={reduceMotion ? 0 : 120} content={<ChartTooltipContent
              labelFormatter={(_, payload) => payload[0]?.payload.fullLabel}
              formatter={(value, name) => <div className="flex flex-1 items-center justify-between gap-4"><span>{SCHEDULE_TYPE_LABELS[name as CampaignType]}</span><span className="tabular-nums">{Number(value).toLocaleString('vi-VN')} lượt</span></div>}
            />} />
            {visibleTypes.map((type) => <Area key={type} type="monotone" dataKey={type} stackId="campaigns" stroke={`var(--color-${type})`} strokeWidth={1.5}
              fill={`url(#${gradientId}-${type})`} dot={weeks.length === 1 ? { r: 3 } : false} activeDot={{ r: 3 }}
              isAnimationActive={!reduceMotion} animationBegin={0} animationDuration={600} animationEasing="ease-in-out" />)}
            <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-2" />} />
          </AreaChart>
        </ChartContainer>
        <figcaption id={captionId} className="roster-week-caption">Mỗi ngày thực hiện được tính một lượt. Các tuần chỉ tính ngày thuộc tháng đang xem.</figcaption>
      </figure>
      <details className="roster-dashboard-chart-data">
        <summary>Xem bảng số liệu</summary>
        <Table className="roster-dashboard-table">
          <TableCaption className="sr-only">Số đoàn từng loại theo tuần</TableCaption>
          <TableHeader><TableRow><TableHead>Khoảng ngày</TableHead>{types.map((type) => <TableHead key={type}>{SCHEDULE_TYPE_LABELS[type]}</TableHead>)}<TableHead>Tổng</TableHead></TableRow></TableHeader>
          <TableBody>{weeks.map((week) => <TableRow key={week.start}><TableCell>{dateRange(week)}</TableCell>{types.map((type) => <TableCell key={type}>{week[type]}</TableCell>)}<TableCell>{totalFor(week)}</TableCell></TableRow>)}</TableBody>
        </Table>
      </details>
    </CardContent>
  </Card>;
}
