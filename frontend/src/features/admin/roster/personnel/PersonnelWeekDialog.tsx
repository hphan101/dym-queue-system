import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { BRANCH_NAMES } from '@/config/branches';
import { formatDateForPrint } from '@/lib/date';
import { useStaffPermissions } from '../../shared/useStaffPermissions';
import { getInsiteWeekDates } from '../clinic/insiteWeek';
import { fetchPersonnelWeek, ROLE_SHORT_LABELS, SCHEDULE_TYPE_LABELS, SHIFT_PERIOD_LABELS, shiftIsoDate, type MedicalPersonnel } from '../data/rosterService';
import { formatAssignmentShift } from '../data/shiftTime';

const weekdayLabels = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];

export function PersonnelWeekDialog({ person, initialDate, onClose }: {
  person: MedicalPersonnel;
  initialDate: string;
  onClose: () => void;
}) {
  const { can } = useStaffPermissions();
  const combined = can('overview') || can('settlement');
  const clinic = combined || can('clinic');
  const onsite = combined || can('onsite');
  const [date, setDate] = useState(initialDate);
  const days = getInsiteWeekDates(date);
  const start = days[0];
  const end = days[6];
  const week = useQuery({
    queryKey: ['personnel-roster-week', person.id, start, clinic, onsite],
    queryFn: () => fetchPersonnelWeek(person.id, start, end, { clinic, onsite }),
    staleTime: 0,
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lịch tuần của {person.full_name}</DialogTitle>
          <DialogDescription>{person.personnel_code} · {ROLE_SHORT_LABELS[person.role_type]}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium tabular-nums" aria-live="polite">
            {formatDateForPrint(start)} – {formatDateForPrint(end)}
          </p>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon-sm" aria-label="Tuần trước" onClick={() => setDate(shiftIsoDate(start, -7))}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <DatePicker value={date} onChange={setDate} ariaLabel="Chọn ngày trong tuần" />
            <Button type="button" variant="outline" size="icon-sm" aria-label="Tuần sau" onClick={() => setDate(shiftIsoDate(start, 7))}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
        {week.isPending ? <Skeleton className="h-24" aria-label="Đang tải lịch tuần" />
        : week.isError ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              Chưa tải được lịch tuần
              <Button type="button" variant="outline" size="sm" className="text-foreground" onClick={() => void week.refetch()}>Thử lại</Button>
            </AlertDescription>
          </Alert>
        ) : week.data.length === 0 ? (
          <Empty><EmptyHeader><EmptyTitle>Chưa có ca trực trong tuần này</EmptyTitle></EmptyHeader></Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {days.map((day, index) => {
              const shifts = week.data.filter(({ schedule }) => schedule.schedule_date === day);
              if (!shifts.length) return null;
              return (
                <section key={day} aria-labelledby={`personnel-week-${day}`}>
                  <h3 id={`personnel-week-${day}`} className="mb-2 text-sm font-medium tabular-nums">
                    {weekdayLabels[index]} · {formatDateForPrint(day)}
                  </h3>
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {shifts.map(({ assignment, schedule }) => (
                      <li key={assignment.id} className="grid gap-1 px-3 py-2 sm:grid-cols-[6.5rem_1fr] sm:gap-3">
                        <span className="text-sm font-medium tabular-nums">
                          {assignment.start_minute == null ? SHIFT_PERIOD_LABELS[assignment.shift_period] : formatAssignmentShift(assignment)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-words text-sm font-medium">
                              {schedule.schedule_type === 'insite' ? BRANCH_NAMES[schedule.branch_code]
                                : schedule.company_name || schedule.campaign_code || SCHEDULE_TYPE_LABELS[schedule.schedule_type]}
                            </span>
                            <Badge variant="secondary">{schedule.schedule_type === 'insite' ? 'Phòng khám' : SCHEDULE_TYPE_LABELS[schedule.schedule_type]}</Badge>
                          </div>
                          <p className="break-words text-sm text-muted-foreground">
                            {[assignment.position_label, schedule.company_address].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
