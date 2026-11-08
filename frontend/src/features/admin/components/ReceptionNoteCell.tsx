import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { saveReceptionNote } from '../receptionNotes';
import { HighlightText } from './HighlightText';

interface ReceptionNoteCellProps {
  id: string;
  name: string;
  value: string;
  query?: string;
  onSaved: (note: string) => void;
}

export function ReceptionNoteCell({ id, name, value, query, onSaved }: ReceptionNoteCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [expected, setExpected] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  const save = async () => {
    if (pending.current) return;
    if (draft.trim() === expected) { setEditing(false); return; }
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveReceptionNote(id, draft, expected);
      onSaved(saved);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu ghi chú.');
    } finally { pending.current = false; setSaving(false); }
  };

  if (!editing) return <button type="button" className="flex min-h-9 w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Sửa ghi chú / STT HIS của ${name}`} onClick={() => {
    setDraft(value); setExpected(value); setError(null); setEditing(true);
  }}>
    <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${value ? '' : 'text-muted-foreground'}`}>
      {value ? <HighlightText text={value} query={query} /> : 'Thêm ghi chú / STT HIS'}
    </span>
    <Pencil className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
  </button>;

  return <div className="flex flex-col gap-2">
    <textarea autoFocus value={draft} maxLength={500} rows={3} disabled={saving}
      aria-label={`Ghi chú / STT HIS của ${name}`} aria-invalid={Boolean(error)}
      className="w-full resize-y rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      placeholder="VD: STT HIS 0123, tên đoàn, ghi chú…" onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void save()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
          event.preventDefault(); event.stopPropagation(); event.currentTarget.blur();
        }
      }} />
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs tabular-nums text-muted-foreground">{draft.length}/500</span>
      {saving && <span role="status" className="text-xs text-muted-foreground">Đang lưu…</span>}
    </div>
    {error && <div role="alert" className="flex flex-col items-start gap-1 text-xs text-destructive"><p>{error}</p><Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void save()}>Thử lại</Button></div>}
  </div>;
}
