import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { getTodayInVietnam } from '../../../../lib/date';
import { formatDisplayDate } from '../../utils/adminFormatters';
import { getInsiteWeekDates } from '../clinic/insiteWeek';
import { fetchOnsiteWeek, groupOnsiteWeek } from './onsiteCalendar';
import {
  SCHEDULE_TYPE_LABELS,
  shiftIsoDate,
  isRosterDateLocked,
  type RosterSchedule,
} from '../data/rosterService';
import { useRosterData } from '../data/useRosterData';
import { setupCaption } from './setupLinks';
import '../clinic/insiteWeek.css';
import './onsiteWeek.css';
import '../shared/campaignColors.css';

export function RosterOnsiteWeek({
  date,
  onDateChange,
  onOpenCampaign,
  onCreateCampaign,
  type,
  onTypeChange,
  refreshKey,
}: {
  date: string;
  onDateChange: (date: string) => void;
  onOpenCampaign: (campaign: RosterSchedule) => void;
  type: string;
  onTypeChange: (type: 'all' | 'onsite_exam' | 'blood_draw' | 'setup') => void;
  refreshKey: number;
  onCreateCampaign: (date: string) => void;
}) {
  const { selectedBranch, setSelectedBranch, canEditHistory } = useRosterData();
  const dates = getInsiteWeekDates(date);
  const start = dates[0],
    end = dates[6],
    today = getTodayInVietnam();
  const [result, setResult] = useState<{
    key: string;
    campaigns: RosterSchedule[];
  } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  );
  const [retry, setRetry] = useState(0);
  const key = `${start}:${end}:${selectedBranch}:${refreshKey}:${retry}`;
  useEffect(() => {
    let current = true;
    void fetchOnsiteWeek(start, end)
      .then((campaigns) => {
        if (current) setResult({ key, campaigns });
      })
      .catch(() => {
        if (current)
          setError({
            key,
            message: 'Không tải được lịch đoàn. Vui lòng thử lại.',
          });
      });
    return () => {
      current = false;
    };
  }, [start, end, key]);
  const loaded = result?.key === key;
  const days = groupOnsiteWeek(
    dates,
    selectedBranch,
    loaded ? result.campaigns : [],
    type,
  );
  const count = [...days.values()].reduce(
    (sum, items) => sum + items.length,
    0,
  );
  const loadError = error?.key === key ? error.message : '';

  return (
    <div className="dym-onsite-week">
      <div className="dym-week-toolbar">
        <div className="dym-week-heading">
          <h2>
            {formatDisplayDate(start)} <span aria-hidden="true">—</span>{' '}
            {formatDisplayDate(end)}
          </h2>
          <p>{loaded ? `${count} đoàn trong tuần` : 'Đang tải lịch đoàn…'}</p>
        </div>
        <div className="dym-week-controls">
          <Tabs
            value={selectedBranch}
            onValueChange={(value) => setSelectedBranch(value as 'q1' | 'q7')}
          >
            <TabsList aria-label="Chọn cơ sở ký hợp đồng">
              <TabsTrigger value="q1">D1</TabsTrigger>
              <TabsTrigger value="q7">D7</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="dym-week-navigation">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Tuần trước"
              onClick={() => onDateChange(shiftIsoDate(start, -7))}
            >
              <ChevronLeft />
            </Button>
            <DatePicker
              value={date}
              onChange={onDateChange}
              ariaLabel="Chọn tuần xem lịch đoàn"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Tuần sau"
              onClick={() => onDateChange(shiftIsoDate(start, 7))}
            >
              <ChevronRight />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={today >= start && today <= end}
            onClick={() => onDateChange(today)}
          >
            Tuần này
          </Button>
          <Select
            value={type}
            onValueChange={(value) =>
              onTypeChange(
                value as 'all' | 'onsite_exam' | 'blood_draw' | 'setup',
              )
            }
          >
            <SelectTrigger
              className="dym-campaign-select w-44"
              aria-label="Lọc loại đoàn trên lịch"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dym-campaign-select">
              <SelectGroup>
                <SelectItem value="all">Tất cả</SelectItem>
                {(['blood_draw', 'onsite_exam', 'setup'] as const).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {SCHEDULE_TYPE_LABELS[value]}
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="dym-onsite-legend" aria-label="Màu loại đoàn">
        {(['blood_draw', 'onsite_exam', 'setup'] as const).map((value) => (
          <span key={value} data-type={value}>
            <i aria-hidden="true" />
            {SCHEDULE_TYPE_LABELS[value]}
          </span>
        ))}
      </div>
      {loadError ? (
        <div role="alert" className="flex items-center gap-3">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setRetry((value) => value + 1)}
          >
            Thử lại
          </Button>
        </div>
      ) : (
        <div className="dym-onsite-calendar-scroll">
          <div
            key={key}
            className="dym-onsite-calendar"
            aria-label="Lịch đoàn theo tuần"
            aria-busy={!loaded}
          >
            {dates.map((day, index) => (
              <section
                key={day}
                className="dym-onsite-calendar-day"
                data-today={day === today}
              >
                <header>
                  <span>{index === 6 ? 'Chủ nhật' : `Thứ ${index + 2}`}</span>
                  <strong>
                    <time dateTime={day}>
                      {formatDisplayDate(day).slice(0, 5)}
                    </time>
                  </strong>
                  <small>
                    {day === today
                      ? 'Hôm nay'
                      : `${days.get(day)!.length} đoàn`}
                  </small>
                </header>
                <div className="dym-onsite-calendar-events">
                  {!loaded ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    days.get(day)!.map((campaign) => (
                      <button
                        key={campaign.id}
                        type="button"
                        data-type={campaign.schedule_type}
                        className="dym-onsite-calendar-event"
                        aria-label={`Mở đoàn ${campaign.company_name}, ${SCHEDULE_TYPE_LABELS[campaign.schedule_type]}, ngày ${formatDisplayDate(day)}`}
                        onClick={() => onOpenCampaign(campaign)}
                      >
                        <span>
                          {SCHEDULE_TYPE_LABELS[campaign.schedule_type]}
                        </span>
                        <strong>{campaign.company_name}</strong>
                        <small>{campaign.campaign_code}</small>
                        {campaign.schedule_type === 'setup' && (
                          <small>{setupCaption(campaign)}</small>
                        )}
                      </button>
                    ))
                  )}
                  {loaded && (
                    <Button
                      type="button"
                      variant="outline"
                      className="dym-onsite-calendar-add"
                      disabled={isRosterDateLocked(day, today, canEditHistory)}
                      title={
                        isRosterDateLocked(day, today, canEditHistory)
                          ? 'Ngày đã khóa; cần quyền sửa lịch cũ.'
                          : `Thêm đoàn ngày ${formatDisplayDate(day)}`
                      }
                      aria-label={`Thêm đoàn ngày ${formatDisplayDate(day)}`}
                      onClick={() => onCreateCampaign(day)}
                    >
                      <Plus data-icon="inline-start" />
                      Thêm đoàn
                    </Button>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
