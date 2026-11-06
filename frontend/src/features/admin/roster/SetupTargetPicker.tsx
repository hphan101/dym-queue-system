import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { formatDisplayDate } from '../utils/adminFormatters';
import { fetchHcChoices, groupHcSchedules } from './setupLinks';
import type { RosterSchedule } from './rosterService';

export function SetupTargetPicker({ branch, ids, onChange }: {
  branch: string; ids: string[]; onChange: (targets: RosterSchedule[]) => void;
}) {
  const [loaded, setLoaded] = useState<{ branch: string; items: RosterSchedule[] } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    void fetchHcChoices(branch).then((items) => { if (active) setLoaded({ branch, items }); })
      .catch(() => { if (active) setError('Không tải được đoàn HC. Vui lòng thử lại.'); });
    return () => { active = false; };
  }, [branch, retry]);
  const ready = loaded?.branch === branch;
  const groups = ready ? groupHcSchedules(loaded.items) : [];
  const selected = groups.find((group) => group.items.some((item) => ids.includes(item.id)));
  return <fieldset className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3 sm:col-span-2">
    <legend className="px-1 text-sm font-medium">Thuộc đoàn khám</legend>
    {error ? <div role="alert" className="flex items-center gap-2"><p className="text-sm text-destructive">{error}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Thử lại</Button></div> : <>
      <Select value={selected?.id ?? ''} disabled={!ready || !groups.length} onValueChange={(id) => {
        const group = groups.find((item) => item.id === id);
        if (group) onChange(group.items);
      }}>
        <SelectTrigger aria-label="Chọn đợt Onsite HC cho lịch set-up"><SelectValue placeholder={!ready ? 'Đang tải đoàn HC…' : 'Chọn đoàn Onsite HC'} /></SelectTrigger>
        <SelectContent className="dym-campaign-select max-w-[calc(100vw-32px)]"><SelectGroup>
          {groups.map((group) => <SelectItem key={group.id} value={group.id} className="whitespace-normal">
            {group.items[0].company_name} · {group.items[0].campaign_code} · {formatDisplayDate(group.items[0].schedule_date)}{group.items.length > 1 ? ` (${group.items.length} ngày)` : ''}
          </SelectItem>)}
        </SelectGroup></SelectContent>
      </Select>
      {ready && !groups.length && <p className="text-sm text-muted-foreground">Chưa có đoàn Onsite HC tại cơ sở này. Hãy tạo đoàn HC trước.</p>}
      {selected && <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Ngày khám liên quan</p>
        {selected.items.map((day) => <label key={day.id} className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={ids.includes(day.id)}
            onChange={(event) => onChange(selected.items.filter((item) => item.id === day.id ? event.target.checked : ids.includes(item.id)))} />
          <span>{formatDisplayDate(day.schedule_date)} <span className="text-muted-foreground">· {day.campaign_code}</span></span>
        </label>)}
      </div>}
      <p className="text-xs text-muted-foreground">Ngày set-up chọn riêng. Chỉ liên kết các ngày khám thuộc cùng đợt HC.</p>
    </>}
  </fieldset>;
}
