import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { MultiDatePicker } from '@/components/ui/multi-date-picker';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateForPrint } from '@/lib/date';
import { useStaffPermissions } from '../../shared/useStaffPermissions';
import {
  deleteRosterUnavailability,
  rosterUnavailabilityKey,
  saveRosterUnavailability,
  useRosterUnavailability,
  type RosterUnavailability,
} from '../data/rosterUnavailability';
import type { MedicalPersonnel } from '../data/rosterService';
import { formatShiftMinute, SHIFT_MINUTES } from '../data/shiftTime';

const emptyDraft = { id: undefined as string | undefined, allDay: true, start: 780, end: 900 };

function blockLabel(block: RosterUnavailability) {
  return block.start_minute === 0
    ? 'Nghỉ cả ngày'
    : `${formatShiftMinute(block.start_minute)}–${formatShiftMinute(block.end_minute)}`;
}

export function PersonnelUnavailabilityDialog({ person, initialDate, onClose }: {
  person: MedicalPersonnel; initialDate: string; onClose: () => void;
}) {
  const prefix = useId();
  const { can } = useStaffPermissions();
  const editable = can('personnel', 'update');
  const queryClient = useQueryClient();
  const [dates, setDates] = useState([initialDate]);
  const [draft, setDraft] = useState(emptyDraft);
  const canSelectMultiple = editable && draft.allDay && !draft.id;
  const date = dates[0] ?? initialDate;
  const blocks = useRosterUnavailability(dates, true, person.id);
  const mutation = useMutation({
    mutationFn: (operation: { removeId: string } | { draft: typeof emptyDraft; dates: string[] }) => {
      if ('removeId' in operation) return deleteRosterUnavailability(operation.removeId);
      const { allDay, start, end, id } = operation.draft;
      return saveRosterUnavailability({
        personnel_id: person.id,
        start_minute: allDay ? 0 : start, end_minute: allDay ? 1440 : end,
      }, operation.dates, id);
    },
    onSuccess: async () => {
      setDraft(emptyDraft);
      await queryClient.invalidateQueries({ queryKey: rosterUnavailabilityKey });
    },
  });
  const invalidTime = !draft.allDay && draft.start >= draft.end;
  const canSubmit = editable && dates.length > 0 && !invalidTime && !mutation.isPending;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) mutation.mutate({ draft, dates });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Giờ bận và ngày nghỉ</DialogTitle>
          <DialogDescription>{person.full_name} · {person.personnel_code}</DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor={prefix + '-date'}>{canSelectMultiple ? 'Ngày nghỉ' : 'Ngày'}</FieldLabel>
          {canSelectMultiple ? (
            <MultiDatePicker id={prefix + '-date'} value={dates} label="ngày nghỉ" disabled={mutation.isPending}
              onChange={(next) => {
                if (mutation.isPending) return;
                setDates(next);
                mutation.reset();
              }}
            />
          ) : (
            <DatePicker id={prefix + '-date'} value={date} ariaLabel="Chọn ngày bận hoặc nghỉ"
              className="justify-start"
              onChange={(next) => {
                if (mutation.isPending) return;
                setDates([next]);
                setDraft((current) => ({ ...current, id: undefined }));
                mutation.reset();
              }}
            />
          )}
        </Field>

        <div className="min-h-12" aria-live="polite">
          {dates.length === 0 ? <p className="text-sm text-muted-foreground">Chọn ngày để xem lịch đã lưu.</p>
          : blocks.isPending ? <Skeleton className="h-12" aria-label="Đang tải giờ bận" />
          : blocks.isError ? (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                Chưa tải được lịch bận
                <Button type="button" variant="outline" size="sm" className="text-foreground"
                  onClick={() => void blocks.refetch()}>
                  Thử lại
                </Button>
              </AlertDescription>
            </Alert>
          ) : blocks.data?.length ? (
            <ul className="divide-y divide-border rounded-md border border-border" aria-label="Giờ bận và ngày nghỉ đã lưu">
              {blocks.data.map((block) => (
                <li key={block.id} className="flex min-h-10 items-center justify-between gap-3 px-3">
                  <span className="text-sm tabular-nums">
                    {dates.length > 1 && `${formatDateForPrint(block.unavailable_date)} · `}{blockLabel(block)}
                  </span>
                  {editable && (
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" disabled={mutation.isPending}
                        aria-label={`Sửa lịch ngày ${formatDateForPrint(block.unavailable_date)} (${blockLabel(block)})`}
                        onClick={() => {
                          mutation.reset();
                          const allDay = block.start_minute === 0;
                          setDates([block.unavailable_date]);
                          setDraft({ ...emptyDraft, id: block.id, allDay,
                            start: allDay ? emptyDraft.start : block.start_minute,
                            end: allDay ? emptyDraft.end : block.end_minute });
                        }}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" disabled={mutation.isPending}
                        aria-label={`Xóa lịch ngày ${formatDateForPrint(block.unavailable_date)} (${blockLabel(block)})`}
                        onClick={() => mutation.mutate({ removeId: block.id })}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">Chưa khai báo giờ bận hoặc ngày nghỉ cho ngày này.</p>}
        </div>

        {editable ? (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel htmlFor={prefix + '-kind'}>Loại</FieldLabel>
                <Select value={draft.allDay ? 'day' : 'time'} disabled={mutation.isPending}
                  onValueChange={(value) => {
                    if (value === 'time') setDates([date]);
                    setDraft((current) => ({ ...current, allDay: value === 'day' }));
                    mutation.reset();
                  }}>
                  <SelectTrigger id={prefix + '-kind'}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="day">Nghỉ cả ngày</SelectItem>
                      <SelectItem value="time">Nghỉ theo giờ</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {!draft.allDay && (
                <FieldGroup className="grid grid-cols-2 gap-3">
                  {(['start', 'end'] as const).map((field) => (
                    <Field key={field} data-invalid={invalidTime || undefined}>
                      <FieldLabel htmlFor={prefix + '-' + field}>{field === 'start' ? 'Bắt đầu' : 'Kết thúc'}</FieldLabel>
                      <Select value={String(draft[field])} disabled={mutation.isPending}
                        onValueChange={(value) => setDraft((current) => ({ ...current, [field]: Number(value) }))}>
                        <SelectTrigger id={prefix + '-' + field} aria-invalid={invalidTime || undefined}><SelectValue /></SelectTrigger>
                        <SelectContent position="popper">
                          <SelectGroup>
                            {SHIFT_MINUTES.slice(field === 'start' ? 0 : 1, field === 'start' ? -1 : undefined).map((minute) => (
                              <SelectItem value={String(minute)} key={minute}>{formatShiftMinute(minute)}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  ))}
                  {invalidTime && <FieldError className="col-span-2">Giờ kết thúc phải sau giờ bắt đầu</FieldError>}
                </FieldGroup>
              )}
            </FieldGroup>
            {mutation.isError && <Alert variant="destructive"><AlertDescription>{mutation.error.message}</AlertDescription></Alert>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={mutation.isPending}
                onClick={draft.id ? () => { setDraft(emptyDraft); mutation.reset(); } : onClose}>
                {draft.id ? 'Hủy sửa' : 'Đóng'}
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {mutation.isPending ? 'Đang lưu…' : draft.id ? 'Lưu thay đổi' : dates.length > 1 ? `Thêm ${dates.length} ngày nghỉ` : 'Thêm lịch bận'}
              </Button>
            </DialogFooter>
          </form>
        ) : <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Đóng</Button></DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
