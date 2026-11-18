import { useEffect, useId, useRef, useState } from 'react';
import { Area, AreaChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { formatVndCurrency } from '../data/rosterService';
import type { SettlementMetrics } from './settlementMetrics';

const metrics = [
  { key: 'forecast', label: 'Chi phí dự kiến', description: 'Phân công + dự phòng trong tháng', color: 'var(--settlement-forecast)' },
  { key: 'actual', label: 'Chi phí đã phát sinh', description: 'Lịch đã qua, tính đến hết hôm qua', color: 'var(--settlement-actual)' },
  { key: 'reserve', label: 'Dự phòng còn thiếu', description: 'Cho hôm nay và các ngày sắp tới', color: 'var(--settlement-reserve)' },
  { key: 'personnel', label: 'Nhân sự có phân công', description: 'Số người riêng biệt trong tháng', color: 'var(--settlement-personnel)' },
] as const;

function AnimatedValue({ value, money, reduceMotion, active }: {
  value: number; money: boolean; reduceMotion: boolean; active: boolean;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const current = useRef(0);
  const format = (amount: number) => money ? formatVndCurrency(amount) : amount.toLocaleString('vi-VN');
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const formatNumber = (amount: number) => money ? formatVndCurrency(amount) : amount.toLocaleString('vi-VN');
    const from = current.current;
    let frame = 0;
    if (reduceMotion) {
      current.current = value;
      node.textContent = formatNumber(value);
      return;
    }
    if (!active) {
      current.current = 0;
      node.textContent = formatNumber(0);
      return;
    }
    if (from === value) return;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 1800);
      current.current = Math.round(from + (value - from) * (1 - (1 - progress) ** 3));
      node.textContent = formatNumber(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    node.textContent = formatNumber(from);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, money, reduceMotion, active]);
  return <><span ref={element} aria-hidden="true">{format(reduceMotion ? value : 0)}</span><span className="sr-only">{format(value)}</span></>;
}

export function SettlementMetricCards({ data, month, isLoading, isActiveTab }: {
  data: SettlementMetrics; month: string; isLoading: boolean; isActiveTab: boolean;
}) {
  return <MetricCardsContent key={`${month}-${isLoading}-${isActiveTab}`} data={data} month={month} isLoading={isLoading} isActiveTab={isActiveTab} />;
}

function MetricCardsContent({ data, month, isLoading, isActiveTab }: {
  data: SettlementMetrics; month: string; isLoading: boolean; isActiveTab: boolean;
}) {
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [readyCharts, setReadyCharts] = useState<string[]>([]);
  const [motionStarted, setMotionStarted] = useState(false);
  const expectedCharts = data.days.some(day => day.actual !== null) ? metrics.length : metrics.length - 1;
  const chartsReady = readyCharts.length === expectedCharts;
  const id = useId().replace(/:/g, '');
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!chartsReady || isLoading || !isActiveTab || reduceMotion) return;
    let secondFrame = 0;
    // Let measured SVGs paint their hidden state before starting both animations.
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setMotionStarted(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [chartsReady, isLoading, isActiveTab, reduceMotion]);

  return <div className="settlement-metrics" data-motion={motionStarted ? 'running' : 'pending'} aria-label="Thống kê quyết toán tháng">
    {metrics.map(metric => {
      const config = { [metric.key]: { label: metric.label, color: metric.color } } satisfies ChartConfig;
      const gradient = `${id}-${metric.key}`;
      const money = metric.key !== 'personnel';
      const chartDays = metric.key === 'actual'
        ? data.days.filter(day => day.actual !== null)
        : data.days;
      return <Card key={metric.key} className="settlement-metric" aria-labelledby={`${gradient}-title`}>
        <CardHeader>
          <CardTitle id={`${gradient}-title`} className="settlement-metric-label">{metric.label}</CardTitle>
          {isLoading ? <Skeleton className="h-9 w-40" /> : <p className="settlement-metric-value">
            <AnimatedValue value={data.totals[metric.key]} money={money} reduceMotion={reduceMotion} active={motionStarted && isActiveTab} />
            {!money && <span className="settlement-metric-unit">người</span>}
          </p>}
          <CardDescription>{metric.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-16 w-full" /> : chartDays.length === 0 ? (
            <p className="settlement-sparkline-empty">Chưa có ngày đã phát sinh</p>
          ) : <ChartContainer config={config} className="settlement-sparkline" aria-label={`${metric.label} theo ngày trong tháng ${month}`}
            onResize={(width, height) => {
              if (width > 0 && height > 0) setReadyCharts(previous => previous.includes(metric.key) ? previous : [...previous, metric.key]);
            }}>
            <AreaChart accessibilityLayer data={chartDays} margin={{ top: 8, right: 2, left: 2, bottom: 4 }}>
              <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={metric.color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={metric.color} stopOpacity={0.04} />
              </linearGradient></defs>
              <XAxis hide dataKey="date" />
              <YAxis hide domain={[0, (max: number) => Math.max(1, max)]} />
              <ChartTooltip animationDuration={reduceMotion ? 0 : 120} cursor={false} content={<ChartTooltipContent
                labelFormatter={label => String(label).split('-').reverse().join('/')}
                formatter={value => <div className="flex items-center justify-between gap-4"><span>{metric.label}</span><strong className="tabular-nums">{money ? formatVndCurrency(Number(value)) : `${value} người`}</strong></div>}
              />} />
              <Area key={month} type="monotone" dataKey={metric.key} stroke={metric.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill={`url(#${gradient})`} dot={chartDays.length === 1 ? { r: 3 } : false} activeDot={{ r: 4 }}
                isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>}
        </CardContent>
      </Card>;
    })}
  </div>;
}
