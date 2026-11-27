import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchRosterAssignmentChanges } from '../data/rosterService';

const changeTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short',
});

export function RosterAssignmentHistory({ assignmentId, defaultOpen = false }: { assignmentId: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const history = useQuery({
    queryKey: ['roster-assignment-changes', assignmentId],
    queryFn: () => fetchRosterAssignmentChanges(assignmentId),
    enabled: open,
    staleTime: 0,
  });
  useEffect(() => {
    if (open && !history.isPending) detailsRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, history.data, history.isError, history.isPending]);
  return (
    <details ref={detailsRef} open={open} className="border-t border-border pt-2 text-sm" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-medium text-foreground">Lịch sử đổi người trực</summary>
      {open && (
        history.isPending ? <Skeleton className="mt-2 h-10" aria-label="Đang tải lịch sử" />
        : history.isError ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground" role="alert">
            Chưa tải được lịch sử
            <Button type="button" variant="outline" size="sm" onClick={() => void history.refetch()}>Thử lại</Button>
          </div>
        ) : history.data.length === 0 ? (
          <p className="mt-2 text-muted-foreground">Ca này chưa đổi người trực.</p>
        ) : (
          <ul className="mt-2 max-h-36 divide-y divide-border overflow-y-auto">
            {history.data.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 py-2">
                <span className="break-words">{entry.from_name} → {entry.to_name}</span>
                <span className="break-words text-xs text-muted-foreground">
                  {entry.actor_name} · <time dateTime={entry.changed_at}>{changeTime.format(new Date(entry.changed_at))}</time>
                </span>
              </li>
            ))}
          </ul>
        )
      )}
    </details>
  );
}
