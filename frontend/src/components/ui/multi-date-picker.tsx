import { useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { getTodayInVietnam } from '@/lib/date';

const displayDate = (date: string) => date.split('-').reverse().join('/');

export function MultiDatePicker({ value, onChange, label = 'ngày khám' }: { value: string[]; onChange: (dates: string[]) => void; label?: string }) {
  const [anchor] = useState(value[0] ?? getTodayInVietnam());
  const toggle = (date: string) => onChange(value.includes(date) ? value.filter((item) => item !== date) : [...value, date].sort());
  return <div className="flex flex-col gap-2">
    <Popover><PopoverTrigger asChild>
      <Button type="button" variant="outline" className="w-full justify-start" aria-label={`Chọn ${label}, đã chọn ${value.length} ngày`}>
        <CalendarDays data-icon="inline-start" />
        {value.length === 1 ? displayDate(value[0]) : value.length ? `${value.length} ngày đã chọn` : `Chọn ${label}`}
      </Button>
    </PopoverTrigger><PopoverContent align="start" className="w-auto p-0">
      <Calendar selected={anchor} selectedDates={value} showDateInput={false} onSelect={toggle} />
    </PopoverContent></Popover>
    {value.length > 1 && <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto" aria-label={`${label} đã chọn`}>
      {value.map((date) => <Button key={date} type="button" variant="secondary" size="sm"
        aria-label={`Bỏ ngày ${displayDate(date)}`} onClick={() => toggle(date)}>{displayDate(date)}<X data-icon="inline-end" /></Button>)}
    </div>}
  </div>;
}
