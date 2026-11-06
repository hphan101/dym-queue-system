import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { getTodayInVietnam } from '../../../lib/date';
import { formatDisplayDate } from '../utils/adminFormatters';
import { buildInsiteWeek, getInsiteWeekDates } from './insiteWeek';
import { fetchRosterBundleForRange, shiftIsoDate, SHIFT_SHORT_LABELS, getProvisionalCost, formatVndCurrency } from './rosterService';
import { useRosterData } from './useRosterData';
import './insiteWeek.css';

type Bundle = Awaited<ReturnType<typeof fetchRosterBundleForRange>>;

export function RosterInsiteWeek({ date, onDateChange, onOpenDay, refreshKey = 0 }: {
  date: string; refreshKey?: number; onDateChange: (date: string) => void; onOpenDay: (date: string) => void;
}) {
  const { selectedBranch, setSelectedBranch, roomsList, personnelMap, isLoading } = useRosterData();
  const dates = getInsiteWeekDates(date);
  const start = dates[0];
  const end = dates[6];
  const today = getTodayInVietnam();
  const [bundle, setBundle] = useState<{ key: string; value: Bundle } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const requestKey = `${start}-${end}-${selectedBranch}-${refreshKey}-${retry}`;
  useEffect(() => {
    let active = true;
    fetchRosterBundleForRange(start, end).then((data) => { if (active) setBundle({ key: requestKey, value: data }); })
      .catch(() => { if (active) setError({ key: requestKey, message: 'Không thể tải lịch tuần. Vui lòng thử lại.' }); });
    return () => { active = false; };
  }, [start, end, requestKey]);
  const loaded = bundle?.key === requestKey ? bundle.value : null;
  const loadError = error?.key === requestKey ? error.message : '';
  const loading = !loaded || isLoading;
  const rows = loaded ? buildInsiteWeek(dates, selectedBranch, roomsList, loaded.dailyRoomOverrides, loaded.schedules, loaded.assignments) : [];
  const personName = (id: string) => personnelMap.get(id)?.full_name ?? 'Nhân sự không còn trong danh mục';

  return (
    <div className="dym-insite-week">
      <div className="dym-week-toolbar">
        <div className="dym-week-heading">
          <h2>{formatDisplayDate(start)} <span aria-hidden="true">—</span> {formatDisplayDate(end)}</h2>
        </div>
        <div className="dym-week-controls">
          <Tabs value={selectedBranch} onValueChange={(value) => setSelectedBranch(value as 'q1' | 'q7')}>
            <TabsList aria-label="Chọn cơ sở D1 hoặc D7">
              <TabsTrigger value="q1">D1</TabsTrigger><TabsTrigger value="q7">D7</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="dym-week-navigation">
            <Button type="button" variant="outline" size="icon" aria-label="Tuần trước" onClick={() => onDateChange(shiftIsoDate(start, -7))}><ChevronLeft /></Button>
            <DatePicker value={date} onChange={onDateChange} ariaLabel="Chọn ngày trong tuần cần xem" />
            <Button type="button" variant="outline" size="icon" aria-label="Tuần sau" onClick={() => onDateChange(shiftIsoDate(start, 7))}><ChevronRight /></Button>
          </div>
          <Button type="button" variant="outline" disabled={today >= start && today <= end} onClick={() => onDateChange(today)}>Tuần này</Button>
        </div>
      </div>
      {loadError ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>Thử lại</Button>
        </div>
      ) : loading ? (
        <div className="dym-week-loading" role="status" aria-label="Đang tải lịch tuần">
          {Array.from({ length: Math.max(4, Math.min(roomsList.length, 8)) }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}
        </div>
      ) : (
        <div className="dym-week-content">
          <div className="dym-week-desktop dym-roster-table-wrap" tabIndex={0} role="region" aria-label="Bảng lịch tuần, có thể cuộn ngang">
            <table className="dym-week-table">
              <caption className="sr-only">Lịch tuần tại phòng khám {selectedBranch === 'q1' ? 'D1' : 'D7'}</caption>
              <thead>
                <tr>
                  <th scope="col" className="dym-week-room-heading">Phòng khám</th>
                  {dates.map((day, index) => (
                    <th key={day} scope="col" data-today={day === today} data-weekend={index > 4} aria-current={day === today ? 'date' : undefined}>
                      <button type="button" className="dym-week-date" onClick={() => onOpenDay(day)} aria-label={`Mở lịch ngày ${formatDisplayDate(day)}`}>
                        <span className="dym-week-weekday">{index === 6 ? 'Chủ nhật' : `Thứ ${index + 2}`}</span>
                        <span className="dym-week-day-number">{formatDisplayDate(day).slice(0, 5)}</span>
                        <span className="dym-week-day-meta">{day === today ? 'Hôm nay' : `${rows.reduce((sum, room) => sum + (room.days.get(day)?.length ?? 0), 0)} ca trực`}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((room) => (
                  <tr key={room.key}>
                    <th scope="row" className="dym-week-room">
                      <span>{room.name}</span>
                      {room.key.startsWith('override:') && <small>Phòng theo ngày</small>}
                    </th>
                    {dates.map((day) => {
                      const items = room.days.get(day);
                      return <td key={day} data-today={day === today}>
                        {items ? <button type="button" onClick={() => onOpenDay(day)}
                          aria-label={`${room.name}, ${formatDisplayDate(day)}: ${items.length} ca trực. Mở lịch ngày để chỉnh sửa`}
                          className="dym-week-cell">
                          {items.length ? items.map((item) => <span key={item.id} className="dym-week-assignment">
                            <span className="dym-week-person">{personName(item.personnel_id)}</span>
                            <Badge variant="secondary">{SHIFT_SHORT_LABELS[item.shift_period]}</Badge>
                          </span>) : <span className="dym-week-empty"><span aria-hidden="true">—</span><span className="dym-week-add"><Plus aria-hidden="true" /> Xếp ca</span></span>}
                        </button> : <span className="dym-week-unavailable" aria-label="Phòng không áp dụng ngày này">Không áp dụng</span>}
                      </td>;
                    })}
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={8} className="dym-week-empty-state">Chưa có phòng trong tuần này. Bấm vào ngày để thêm phòng và xếp ca.</td></tr>}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="dym-week-room">Dự phòng còn thiếu</th>
                  {dates.map((day) => <td key={day}><button type="button" className="dym-week-cell" onClick={() => onOpenDay(day)} aria-label={`Sửa dự phòng ngày ${formatDisplayDate(day)}`}>
                    {formatVndCurrency(getProvisionalCost(loaded?.schedules.find((item) => item.schedule_type === 'insite' && item.branch_code === selectedBranch && item.schedule_date === day)))}
                  </button></td>)}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="dym-week-mobile">
            {dates.map((day, index) => {
              const staffed = rows.filter((room) => (room.days.get(day)?.length ?? 0) > 0);
              return <section key={day} className="dym-week-agenda" data-today={day === today}>
                <Button type="button" variant="ghost" className="dym-week-agenda-date" onClick={() => onOpenDay(day)} aria-label={`Mở lịch ngày ${formatDisplayDate(day)}`}>
                  <span>{index === 6 ? 'Chủ nhật' : `Thứ ${index + 2}`} · {formatDisplayDate(day)}{day === today ? ' · Hôm nay' : ''}</span>
                  <ArrowUpRight data-icon="inline-end" />
                </Button>
                <p className="dym-week-agenda-empty">Dự phòng: {formatVndCurrency(getProvisionalCost(loaded?.schedules.find((item) => item.schedule_type === 'insite' && item.branch_code === selectedBranch && item.schedule_date === day)))}</p>
                {staffed.length ? staffed.map((room) => <div key={room.key} className="dym-week-agenda-room">
                  <span>{room.name}</span>
                  <div>{room.days.get(day)!.map((item) => <p key={item.id}>{personName(item.personnel_id)} <span>· {SHIFT_SHORT_LABELS[item.shift_period]}</span></p>)}</div>
                </div>) : <p className="dym-week-agenda-empty">Chưa xếp ca. Bấm ngày để bắt đầu.</p>}
              </section>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
