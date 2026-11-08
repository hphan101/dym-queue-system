import { useId } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatDisplayDate } from '../../utils/adminFormatters';
import { SCHEDULE_TYPE_LABELS } from '../data/rosterService';
import {
  getWeeklyChartScale,
  type buildDashboardSummary,
} from './dashboardSummary';

type Week = ReturnType<typeof buildDashboardSummary>['weeks'][number];
const types = ['blood_draw', 'onsite_exam', 'setup'] as const;
const totalFor = (week: Week) =>
  week.blood_draw + week.onsite_exam + week.setup;
const dateRange = (week: Week) =>
  `${formatDisplayDate(week.start).slice(0, 5)} - ${formatDisplayDate(week.end).slice(0, 5)}`;

export function WeeklyCampaignChart({
  weeks,
  count,
  month,
}: {
  weeks: Week[];
  count: number;
  month: string;
}) {
  const titleId = useId();
  const captionId = useId();
  const { maximum, ticks } = getWeeklyChartScale(
    Math.max(0, ...weeks.map(totalFor)),
  );

  return (
    <Card>
      <CardHeader className="px-5 py-4">
        <CardTitle>
          <h3 id={titleId}>Số đoàn theo tuần</h3>
        </CardTitle>
        <CardDescription>
          Tháng {month.slice(5)}/{month.slice(0, 4)} · {count} lượt thực hiện
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="roster-week-legend" aria-label="Tổng theo loại đoàn">
          {types.map((type) => (
            <div key={type} data-type={type}>
              <span className="roster-week-swatch" aria-hidden="true" />
              <span>{SCHEDULE_TYPE_LABELS[type]}</span>
              <strong>
                {weeks.reduce((sum, week) => sum + week[type], 0)}
              </strong>
            </div>
          ))}
        </div>

        <figure aria-labelledby={titleId} aria-describedby={captionId}>
          <div className="roster-week-scroll">
            <div className="roster-week-chart">
              <div className="roster-week-axis" aria-hidden="true">
                {ticks.map((tick) => (
                  <span
                    key={tick}
                    style={{ bottom: `${(tick / maximum) * 100}%` }}
                  >
                    {tick}
                  </span>
                ))}
              </div>
              <div className="roster-week-plot">
                <div className="roster-week-grid" aria-hidden="true">
                  {ticks.map((tick) => (
                    <span
                      key={tick}
                      style={{ bottom: `${(tick / maximum) * 100}%` }}
                    />
                  ))}
                </div>
                <TooltipProvider delayDuration={100}>
                  <div
                    className="roster-week-columns"
                    style={{
                      gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {weeks.map((week, index) => {
                      const total = totalFor(week);
                      return (
                        <Tooltip key={week.start}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="roster-week-column"
                              aria-label={`Tuần ${index + 1}, ${dateRange(week)}: ${total} lượt. ${types.map((type) => `${SCHEDULE_TYPE_LABELS[type]}: ${week[type]}`).join(', ')}`}
                            >
                              <span
                                className="roster-week-bar-area"
                                aria-hidden="true"
                              >
                                {total > 0 ? (
                                  <span
                                    className="roster-week-bar-wrap"
                                    style={{
                                      height: `${(total / maximum) * 100}%`,
                                    }}
                                  >
                                    <strong className="roster-week-total">
                                      {total}
                                    </strong>
                                    <span className="roster-week-stack">
                                      {types.map(
                                        (type) =>
                                          week[type] > 0 && (
                                            <span
                                              key={type}
                                              data-type={type}
                                              style={{ flex: week[type] }}
                                            />
                                          ),
                                      )}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="roster-week-zero">0</span>
                                )}
                              </span>
                              <span className="roster-week-label">
                                Tuần {index + 1}
                              </span>
                              <span className="roster-week-date">
                                {dateRange(week)}
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            className="roster-week-tooltip"
                            sideOffset={12}
                          >
                            <p>
                              Tuần {index + 1} · {dateRange(week)}
                            </p>
                            <div className="roster-week-tooltip-rows">
                              {types.map((type) => (
                                <div key={type}>
                                  <span>{SCHEDULE_TYPE_LABELS[type]}</span>
                                  <strong>{week[type]}</strong>
                                </div>
                              ))}
                              <div>
                                <span>Tổng lượt</span>
                                <strong>{total}</strong>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </TooltipProvider>
              </div>
            </div>
          </div>
          <figcaption id={captionId} className="roster-week-caption">
            Mỗi ngày thực hiện được tính một lượt. Các tuần chỉ tính ngày thuộc
            tháng đang xem.
          </figcaption>
        </figure>

        <details className="roster-dashboard-chart-data">
          <summary>Xem bảng số liệu</summary>
          <div className="roster-dashboard-table-scroll">
            <table className="roster-dashboard-table">
              <caption className="sr-only">Số đoàn từng loại theo tuần</caption>
              <thead>
                <tr>
                  <th>Khoảng ngày</th>
                  {types.map((type) => (
                    <th key={type}>{SCHEDULE_TYPE_LABELS[type]}</th>
                  ))}
                  <th>Tổng</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week.start}>
                    <td>{dateRange(week)}</td>
                    {types.map((type) => (
                      <td key={type}>{week[type]}</td>
                    ))}
                    <td>{totalFor(week)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
